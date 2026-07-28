'use strict'
const dbUtils = require('../../utils')

// Every audience answers the same question — "who gets an envelope" — and so
// returns the same seven columns from the same base table. Only the joins and
// the WHERE clause differ, so the shared head lives here once.
//
// person.fullName is generated "Last, First" — NOT label order; select the
// name parts. person.zip is stored unpadded, so LPAD is load-bearing.
//
// The string below is whitespace-sensitive: it reproduces the pre-refactor
// hand-written query byte-for-byte, which the test suite pins.
const SELECT_HEAD = `
    SELECT
      p.firstName,
      p.lastName,
      p.street,
      p.unit,
      p.city,
      p.state,
      LPAD(p.zip, 5, '0') AS zip
    FROM person p`

// "Active" is enforced by the active_* views rather than restated in each
// audience. Migrations adding member/volunteer columns must re-run
// CREATE OR REPLACE VIEW on these.
const ROLE_JOIN = {
  member: 'INNER JOIN active_member m ON m.personId = p.id',
  volunteer: 'INNER JOIN active_volunteer vol ON vol.personId = p.id',
}

// Village membership for BOTH members and volunteers is person.villageId —
// the person's primary village. volunteer_village_associate holds a
// volunteer's *associate* villages (the ones they also serve) and is
// deliberately NOT consulted: mailing follows where someone lives. It is also
// empty for all 650 active volunteers in the 2026-07-28 dev snapshot, so
// joining through it would return zero labels.
const VILLAGE_JOIN = 'INNER JOIN village v ON v.id = p.villageId'

// Pure: builds SQL and binds, touching no database. Kept separate from
// execution so it is unit-testable — this project unit-tests pure functions
// only and does not mock dbUtils.pool (see test/personService.test.js:5-10).
function buildRecipientQuery ({ role, village = null, predicates = [] } = {}) {
  const roleJoin = ROLE_JOIN[role]
  if (!roleJoin) throw new Error(`unknown role: ${role}`)

  const joins = [roleJoin]
  const where = []
  const binds = []

  // Village first so its bind ordering is stable regardless of predicates.
  if (village) {
    joins.push(VILLAGE_JOIN)
    where.push('v.name = ?')
    binds.push(village)
  }
  where.push(...predicates)

  const sql = `${SELECT_HEAD}
    ${joins.join('\n    ')}
    WHERE ${where.join(' AND ')}
  `
  return { sql, binds }
}

async function queryRecipients (spec) {
  const { sql, binds } = buildRecipientQuery(spec)
  const [rows] = await dbUtils.pool.query(sql, binds)
  return rows
}

module.exports = { buildRecipientQuery, queryRecipients }
