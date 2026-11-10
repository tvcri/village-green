'use strict'
const dbUtils = require('../utils')
const { AUDIENCE_RULES, ROLE_ORDER, includesDonor } = require('./audienceRules')

// Every mailing answers the same question — "who gets an envelope" — and so
// returns the same nine columns from the same base table. Only the role
// join/predicate and the audience predicate differ.
//
// person.fullName is generated "Last, First, Suffix" — NOT label order;
// select the name parts (suffix is its own column since 0027). person.zip is stored unpadded, so LPAD is load-bearing.
//
// The string below is whitespace-sensitive: the printed-newsletter/member
// shape reproduces the original hand-written query byte-for-byte, which the
// test suite pins.
const SELECT_HEAD = `
    SELECT
      p.firstName,
      p.lastName,
      p.suffix,
      p.nickname,
      p.street,
      p.unit,
      p.city,
      p.state,
      LPAD(p.zip, 5, '0') AS zip
    FROM person p`

// "Active" is enforced by the active_* views rather than restated per shape.
// Migrations adding member/volunteer columns must re-run
// CREATE OR REPLACE VIEW on these.
const ROLE_JOIN = {
  member: 'INNER JOIN active_member m ON m.personId = p.id',
  volunteer: 'INNER JOIN active_volunteer vol ON vol.personId = p.id',
}

// A role list of more than one role (or donor alone) is one OR of EXISTS
// conditions, not joins, so a person who matches several roles yields one row
// (no DISTINCT, no UNION), and "active" still comes from the views.
const MEMBER_EXISTS = 'EXISTS (SELECT 1 FROM active_member m WHERE m.personId = p.id)'
const VOLUNTEER_EXISTS = 'EXISTS (SELECT 1 FROM active_volunteer vol WHERE vol.personId = p.id)'

// Donors are a person association (the donor table), not a status view, so
// the deceased check is explicit here; the active views already exclude
// them for members and volunteers. The last-gift window applies only to this
// clause, and a NULL lastGiftDate fails `>=`, so any window excludes donors
// with no recorded gift.
function donorPredicate (hasCutoff) {
  return '(p.deceased = 0 AND EXISTS (SELECT 1 FROM donor d WHERE d.personId = p.id'
    + `${hasCutoff ? ' AND d.lastGiftDate >= ?' : ''}))`
}

// Pure: builds SQL and binds, touching no database. Kept separate from
// execution so it is unit-testable — this project unit-tests pure functions
// only and does not mock dbUtils.pool.
//
// The controller 422s bad parameter combinations first (validateLabelParams,
// driven by the same AUDIENCE_RULES table); the throws here are defense in
// depth for future service-level callers that bypass the validator.
function buildRecipientQuery ({ audience, roles, villageId = null, month = null, lastGiftSince = null } = {}) {
  const joins = []
  const where = []
  const binds = []

  if (!Array.isArray(roles) || roles.length === 0) {
    throw new Error('buildRecipientQuery requires at least one role')
  }
  for (const r of roles) {
    if (!ROLE_ORDER.includes(r)) throw new Error(`unknown role: ${r}`)
  }
  const hasCutoff = lastGiftSince !== null && lastGiftSince !== undefined
  if (hasCutoff && !includesDonor(roles)) {
    throw new Error('lastGiftSince requires donor in roles')
  }

  if (roles.length === 1 && roles[0] !== 'donor') {
    // A lone member or volunteer role joins its view. Member-only audiences
    // read m.* through this join, and the printed-newsletter SQL is pinned.
    joins.push(ROLE_JOIN[roles[0]])
  }
  else {
    // Fixed order whatever the request order, so the SQL is deterministic.
    const conditions = ROLE_ORDER.filter(r => roles.includes(r)).map(r => {
      if (r === 'member') return MEMBER_EXISTS
      if (r === 'volunteer') return VOLUNTEER_EXISTS
      if (hasCutoff) binds.push(lastGiftSince)
      return donorPredicate(hasCutoff)
    })
    where.push(conditions.length === 1 ? conditions[0] : `(${conditions.join(' OR ')})`)
  }

  const rules = AUDIENCE_RULES[audience]
  if (!rules) {
    throw new Error(`unknown audience: ${audience}`)
  }
  if (rules.memberOnly && !(roles.length === 1 && roles[0] === 'member')) {
    throw new Error(`audience ${audience} requires role member only`)
  }
  if (includesDonor(roles) && !rules.allowsDonors) {
    throw new Error(`audience ${audience} does not accept donor`)
  }
  const hasMonth = month !== null && month !== undefined
  if (rules.requiresMonth && !hasMonth) {
    throw new Error(`audience ${audience} requires month`)
  }
  // A silently dropped month would present the full roster as a month run —
  // wrong rows with no error — so reject it like the other mismatches.
  if (!rules.requiresMonth && hasMonth) {
    throw new Error(`audience ${audience} does not accept month`)
  }

  // Village first so its bind ordering is stable regardless of audience.
  if (villageId !== null && villageId !== undefined) {
    where.push('p.villageId = ?')
    binds.push(villageId)
  }

  switch (audience) {
    case 'roster':
      break
    case 'printed-newsletter':
      // bit(1) NULL is three-valued; only an explicit 1 qualifies.
      where.push('m.printedNewsletter = 1')
      break
    case 'birthday-month':
      where.push('MONTH(p.birthDate) = ?')
      binds.push(month)
      break
    case 'join-month':
      where.push('MONTH(m.joinDate) = ?')
      binds.push(month)
      break
  }

  // roster/member with no village has nothing to filter on, and an
  // unconditional WHERE would emit a dangling clause — ER_PARSE_ERROR at
  // request time rather than a wrong result.
  const clauses = [SELECT_HEAD]
  if (joins.length) clauses.push(`    ${joins.join('\n    ')}`)
  if (where.length) clauses.push(`    WHERE ${where.join(' AND ')}`)

  const sql = `${clauses.join('\n')}\n  `
  return { sql, binds }
}

async function queryRecipients (spec) {
  const { sql, binds } = buildRecipientQuery(spec)
  const [rows] = await dbUtils.pool.query(sql, binds)
  return rows
}

module.exports = { buildRecipientQuery, queryRecipients }
