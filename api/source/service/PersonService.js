'use strict';
const dbUtils = require('./utils')
const { hasPermission } = require('../utils/authz')
const AuditService = require('./audit/AuditService')
const SmError = require('../utils/error')
const volunteerAssignments = require('./volunteerAssignments')

// Replacement-set rules that no constraint can express, checked before the
// transaction opens so they surface as 400s rather than 500s:
//   - one preferred language and one primary contact per person. The junction
//     carries the flag (a per-link attribute, unlike person_race), so the rule
//     is about the whole set, not any one row.
//   - no repeated race/language id. Those DO have unique indexes, but reaching
//     them means a raw ER_DUP_ENTRY.
function validateSets ({ races, languages, contacts }) {
  // person_race and person_language carry UNIQUE (personId, raceId) /
  // (personId, languageId), so a repeated id would surface as a raw
  // ER_DUP_ENTRY 500. Reject it here as a 400 instead.
  if (races && new Set(races).size !== races.length) {
    throw new SmError.ClientError('duplicate race')
  }
  if (languages && new Set(languages.map(l => l.languageId)).size !== languages.length) {
    throw new SmError.ClientError('duplicate language')
  }
  if (languages && languages.filter(l => l.isPreferred).length > 1) {
    throw new SmError.ClientError('at most one preferred language')
  }
  if (contacts && contacts.filter(c => c.isPrimary).length > 1) {
    throw new SmError.ClientError('at most one primary contact')
  }
}

async function writeSets (connection, personId, { races, languages, contacts }, { replace }) {
  if (races !== undefined) {
    if (replace) await connection.query('DELETE FROM person_race WHERE personId = ?', [personId])
    if (races.length) {
      await connection.query('INSERT INTO person_race (personId, raceId) VALUES ?',
        [races.map(raceId => [personId, raceId])])
    }
  }
  if (languages !== undefined) {
    if (replace) await connection.query('DELETE FROM person_language WHERE personId = ?', [personId])
    if (languages.length) {
      await connection.query('INSERT INTO person_language (personId, languageId, isPreferred) VALUES ?',
        [languages.map(l => [personId, l.languageId, l.isPreferred ? 1 : 0])])
    }
  }
  if (contacts !== undefined) {
    if (replace) await connection.query('DELETE FROM person_contact WHERE personId = ?', [personId])
    if (contacts.length) {
      await connection.query(
        'INSERT INTO person_contact (personId, name, relationship, phone, email, isPrimary, sequence) VALUES ?',
        [contacts.map((c, i) => [personId, c.name, c.relationship ?? null, c.phone ?? null, c.email ?? null,
          c.isPrimary ? 1 : 0, c.sequence ?? i])])
    }
  }
}

const ACTIVE_AS_COLUMN = `CASE
      WHEN m.id IS NOT NULL AND vol.id IS NOT NULL THEN JSON_ARRAY('member','volunteer')
      WHEN m.id IS NOT NULL THEN JSON_ARRAY('member')
      WHEN vol.id IS NOT NULL THEN JSON_ARRAY('volunteer')
      ELSE JSON_ARRAY()
    END AS activeAs`

const VILLAGE_COLUMN = `JSON_OBJECT('villageId', CAST(v.id AS CHAR), 'name', v.name) AS village`

// circles + disabilities are `required` on the Person schema, so every
// full-row path must emit them. NULL-safe via COALESCE — a person with none
// yields JSON_ARRAY(), not null. Bare subqueries so they compose as top-level
// columns (full rows) or JSON_OBJECT values (the detail projection).
const CIRCLES_SUBQUERY = `(
      SELECT COALESCE(
        ${dbUtils.jsonArrayAgg({
          value: `JSON_OBJECT('circleId', CAST(c.id AS CHAR), 'name', c.name)`,
          orderBy: 'c.name'
        })},
        JSON_ARRAY()
      )
      FROM person_circle pc
      JOIN circle c ON c.id = pc.circleId
      WHERE pc.personId = p.id
    )`

const DISABILITIES_SUBQUERY = `(
      SELECT COALESCE(
        ${dbUtils.jsonArrayAgg({
          value: `JSON_OBJECT('disabilityId', CAST(d.id AS CHAR), 'name', d.name, 'note', pd.note)`,
          orderBy: 'd.name'
        })},
        JSON_ARRAY()
      )
      FROM person_disability pd
      JOIN disability d ON d.id = pd.disabilityId
      WHERE pd.personId = p.id
        AND d.name IN ('Vision', 'Walker', 'Hearing', 'Wheelchair', 'Cane')
    )`

const CIRCLES_COLUMN = `${CIRCLES_SUBQUERY} AS circles`
const DISABILITIES_COLUMN = `${DISABILITIES_SUBQUERY} AS disabilities`

// ---- New person columns (Person Working Group, 2026-09-02) ----------------
// Ungated (Chris Daley's T1/T2 tiers): a volunteer at the door needs
// pronouns; deceasedDate, contact method, languages and contacts are
// service-operational. Booleans inside JSON_OBJECT are spelled as JSON
// true/false — a bare BIT serializes as 0/1 and fails OAS validation
// (CLAUDE.md, MySQL/OAS traps). Top-level BIT columns rely on the pool's
// BIT(1) -> boolean typeCast.
const jsonBool = expr => `CASE WHEN ${expr} IS NULL THEN NULL
      WHEN ${expr} THEN CAST('true' AS JSON) ELSE CAST('false' AS JSON) END`
const CONTACT_METHOD_OBJECT = `CASE WHEN cm.id IS NULL THEN NULL
      ELSE JSON_OBJECT('contactMethodId', CAST(cm.id AS CHAR), 'name', cm.name) END`
const LANGUAGES_SUBQUERY = `(
      SELECT COALESCE(
        ${dbUtils.jsonArrayAgg({
          value: `JSON_OBJECT('languageId', CAST(l.id AS CHAR), 'name', l.name, 'tag', l.tag,
                              'isPreferred', ${jsonBool('pl.isPreferred')})`,
          orderBy: 'pl.isPreferred DESC, l.name'
        })},
        JSON_ARRAY()
      )
      FROM person_language pl
      JOIN language l ON l.id = pl.languageId
      WHERE pl.personId = p.id
    )`
const CONTACTS_SUBQUERY = `(
      SELECT COALESCE(
        ${dbUtils.jsonArrayAgg({
          value: `JSON_OBJECT('contactId', CAST(pc2.id AS CHAR), 'name', pc2.name,
                              'relationship', pc2.relationship, 'phone', pc2.phone, 'email', pc2.email,
                              'isPrimary', ${jsonBool('pc2.isPrimary')}, 'sequence', pc2.sequence)`,
          orderBy: 'pc2.isPrimary DESC, pc2.sequence, pc2.id'
        })},
        JSON_ARRAY()
      )
      FROM person_contact pc2
      WHERE pc2.personId = p.id
    )`
// Ungated columns/joins for the full Person row
const RECORD_COLUMNS = [
  'p.suffix',
  'p.displayName',
  'p.pronouns',
  "DATE_FORMAT(p.deceasedDate, '%Y-%m-%d') AS deceasedDate",
  `${CONTACT_METHOD_OBJECT} AS preferredContactMethod`,
  `${LANGUAGES_SUBQUERY} AS languages`,
  `${CONTACTS_SUBQUERY} AS contacts`,
]
const RECORD_JOINS = ['LEFT JOIN contact_method cm ON cm.id = p.preferredContactMethodId']

// Gated by person:read_demographics (T3) — omitted, never nulled, like birthDate.
const RACES_SUBQUERY = `(
      SELECT COALESCE(
        ${dbUtils.jsonArrayAgg({
          value: `JSON_OBJECT('raceId', CAST(r.id AS CHAR), 'name', r.name)`,
          orderBy: 'r.name'
        })},
        JSON_ARRAY()
      )
      FROM person_race pr
      JOIN race r ON r.id = pr.raceId
      WHERE pr.personId = p.id
    )`
const GENDER_OBJECT = `CASE WHEN g.id IS NULL THEN NULL
      ELSE JSON_OBJECT('genderId', CAST(g.id AS CHAR), 'name', g.name) END`
const ETHNICITY_OBJECT = `CASE WHEN e.id IS NULL THEN NULL
      ELSE JSON_OBJECT('ethnicityId', CAST(e.id AS CHAR), 'name', e.name) END`
const DEMOGRAPHICS_COLUMNS = [
  `${GENDER_OBJECT} AS gender`,
  `${ETHNICITY_OBJECT} AS ethnicity`,
  `${RACES_SUBQUERY} AS races`,
  'p.isVeteran',
]
const DEMOGRAPHICS_JOINS = [
  'LEFT JOIN gender g ON g.id = p.genderId',
  'LEFT JOIN ethnicity e ON e.id = p.ethnicityId',
]

// The getPersons `detail` projection: summary rows gain a same-named object
// with the Person columns the summary lacks (projection convention — a
// projection adds a property, it never reshapes the row). email/phone/cell
// stay out: the summary root already carries them. birthDate is gated by
// person:read_birth_date and gender/ethnicity/races/isVeteran by
// person:read_demographics — omitted, never nulled, like memberColumn's
// financial fields.
function detailColumn ({ birthDate, demographics }) {
  return `JSON_OBJECT(
      'lastName', p.lastName,
      'firstName', p.firstName,
      'middleInitial', p.middleInitial,
      'nickname', p.nickname,
      'suffix', p.suffix,
      'displayName', p.displayName,
      'pronouns', p.pronouns,
      'street', p.street,
      'unit', p.unit,
      'address', p.address,
      'city', p.city,
      'state', p.state,
      'zip', LPAD(p.zip, 5, '0'),
      'town', p.town,
      ${birthDate ? `'birthDate', DATE_FORMAT(p.birthDate, '%Y-%m-%d'),` : ''}
      'deceasedDate', DATE_FORMAT(p.deceasedDate, '%Y-%m-%d'),
      'preferredContactMethod', ${CONTACT_METHOD_OBJECT},
      'languages', ${LANGUAGES_SUBQUERY},
      'contacts', ${CONTACTS_SUBQUERY},
      ${demographics ? `'gender', ${GENDER_OBJECT},
      'ethnicity', ${ETHNICITY_OBJECT},
      'races', ${RACES_SUBQUERY},
      'isVeteran', ${jsonBool('p.isVeteran')},` : ''}
      'emergencyContactName', p.emergencyContactName,
      'emergencyContactRelationship', p.emergencyContactRelationship,
      'emergencyContactPhone', p.emergencyContactPhone,
      'emergencyContactEmail', p.emergencyContactEmail,
      'circles', ${CIRCLES_SUBQUERY},
      'disabilities', ${DISABILITIES_SUBQUERY}
    ) AS detail`
}

function memberColumn ({ financial, scNote, inactive }) {
  // Row gating: without member:read_inactive the source is the
  // active_member view, so a dropped/deceased member yields NULL here.
  const memberSource = inactive ? 'member' : 'active_member'
  return `(SELECT JSON_OBJECT(
      'memberId', CAST(m2.id AS CHAR),
      'personId', CAST(m2.personId AS CHAR),
      'memberNumber', m2.memberNumber,
      'memberLevel', m2.memberLevel,
      ${financial ? `'householdDues', m2.householdDues,` : ''}
      'memberType', m2.memberType,
      'primaryPerson', (
        SELECT JSON_OBJECT('personId', CAST(pp.id AS CHAR), 'fullName', pp.fullName)
        FROM person pp WHERE pp.id = m2.primaryPersonId
      ),
      'secondaryType', m2.secondaryType,
      'secondaryPersons', (
        SELECT COALESCE(
          ${dbUtils.jsonArrayAgg({
            value: `JSON_OBJECT('personId', CAST(sp.id AS CHAR), 'fullName', sp.fullName, 'secondaryType', sm.secondaryType)`,
            orderBy: 'sp.fullName'
          })},
          JSON_ARRAY()
        )
        FROM ${memberSource} sm
        JOIN person sp ON sp.id = sm.personId
        WHERE sm.primaryPersonId = m2.personId
      ),
      'serviceNotes', m2.serviceNotes,
      'joinDate', DATE_FORMAT(m2.joinDate, '%Y-%m-%d'),
      'createdDate', DATE_FORMAT(m2.createdDate, '%Y-%m-%d'),
      'status', m2.status,
      'dropReason', m2.dropReason,
      'householdSize', m2.householdSize,
      ${financial ? `'quickbooksKey', m2.quickbooksKey,` : ''}
      'printedNewsletter', m2.printedNewsletter != 0,
      ${scNote ? `'scNotes', m2.scNotes,` : ''}
      'statusChangeNotes', m2.statusChangeNotes,
      'miscNotes', m2.miscNotes,
      'circlePreferences', (
        SELECT COALESCE(
          ${dbUtils.jsonArrayAgg({
            value: `JSON_OBJECT('circleId', CAST(c.id AS CHAR), 'name', c.name)`,
            orderBy: 'c.name'
          })},
          JSON_ARRAY()
        )
        FROM member_circle_preference mcp
        JOIN circle c ON c.id = mcp.circleId
        WHERE mcp.memberId = m2.id
      )
    ) FROM ${memberSource} m2 WHERE m2.personId = p.id) AS \`member\``
}

function volunteerColumn ({ inactive }) {
  const volunteerSource = inactive ? 'volunteer' : 'active_volunteer'
  return `(SELECT JSON_OBJECT(
      'volunteerId', CAST(vol3.id AS CHAR),
      'personId', CAST(vol3.personId AS CHAR),
      'providerType', vol3.providerType,
      'notes', vol3.notes,
      'active', vol3.active != 0,
      'capabilities', (
        SELECT COALESCE(
          CAST(CONCAT('[', GROUP_CONCAT(CONCAT('"', c.name, '"') ORDER BY c.name), ']') AS JSON),
          JSON_ARRAY()
        )
        FROM volunteer_capability vc
        JOIN capability c ON c.id = vc.capabilityId
        WHERE vc.volunteerId = vol3.id
      ),
      'associateVillages', (
        SELECT COALESCE(
          CAST(CONCAT('[', GROUP_CONCAT(
            JSON_OBJECT('villageId', CAST(vva.villageId AS CHAR), 'name', av.name) ORDER BY av.name
          ), ']') AS JSON),
          JSON_ARRAY()
        )
        FROM volunteer_village_associate vva
        JOIN village av ON av.id = vva.villageId
        WHERE vva.volunteerId = vol3.id
      ),
      'vettings', (
        SELECT COALESCE(
          CAST(CONCAT('[', GROUP_CONCAT(
            JSON_OBJECT(
              'vettingTypeId', CAST(vv.vettingTypeId AS CHAR),
              'name', vt.name,
              'dateEntered', DATE_FORMAT(vv.dateEntered, '%Y-%m-%d'),
              'dateExpired', DATE_FORMAT(vv.dateExpired, '%Y-%m-%d')
            ) ORDER BY vt.name, vv.dateEntered
          ), ']') AS JSON),
          JSON_ARRAY()
        )
        FROM volunteer_vetting vv
        JOIN vetting_type vt ON vt.id = vv.vettingTypeId
        WHERE vv.volunteerId = vol3.id
      ),
      'trainings', (
        SELECT COALESCE(
          CAST(CONCAT('[', GROUP_CONCAT(
            JSON_OBJECT(
              'volunteerTrainingId', CAST(vtr.id AS CHAR),
              'trainingId', CAST(vtr.trainingId AS CHAR),
              'name', tr.name,
              'completedDate', DATE_FORMAT(vtr.completedDate, '%Y-%m-%d'),
              'notes', vtr.notes
            ) ORDER BY tr.name, vtr.completedDate IS NULL, vtr.completedDate DESC
          ), ']') AS JSON),
          JSON_ARRAY()
        )
        FROM volunteer_training vtr
        JOIN training tr ON tr.id = vtr.trainingId
        WHERE vtr.volunteerId = vol3.id
      ),
      'positions', (
        SELECT COALESCE(
          CAST(CONCAT('[', GROUP_CONCAT(
            JSON_OBJECT(
              'volunteerPositionId', CAST(vp.id AS CHAR),
              'positionId', CAST(vp.positionId AS CHAR),
              'name', pos.name,
              'scope', pos.scope,
              'village', IF(vp.villageId IS NULL, NULL, JSON_OBJECT('villageId', CAST(vp.villageId AS CHAR), 'name', pv.name)),
              'circle', IF(vp.circleId IS NULL, NULL, JSON_OBJECT('circleId', CAST(vp.circleId AS CHAR), 'name', pc.name))
            ) ORDER BY pos.name, pv.name, pc.name
          ), ']') AS JSON),
          JSON_ARRAY()
        )
        FROM volunteer_position vp
        JOIN \`position\` pos ON pos.id = vp.positionId
        LEFT JOIN village pv ON pv.id = vp.villageId
        LEFT JOIN circle pc ON pc.id = vp.circleId
        WHERE vp.volunteerId = vol3.id
      )
    ) FROM ${volunteerSource} vol3 WHERE vol3.personId = p.id) AS \`volunteer\``
}

// ?projection=application: a root object whose keys appear only with their
// read_application gate. Base tables, never the active_* views — a dropped
// member's application must stay readable to those allowed to read it.
function applicationColumn ({ member, volunteer }) {
  const parts = []
  if (member) parts.push(`'member', (SELECT ma.application FROM member ma WHERE ma.personId = p.id)`)
  if (volunteer) parts.push(`'volunteer', (SELECT va.application FROM volunteer va WHERE va.personId = p.id)`)
  return `JSON_OBJECT(${parts.join(', ')}) AS application`
}

// Single query path for person reads: getPerson, getPersons, and
// getPersonsByVillage all build here. These column fragments were once
// copy-diverged across three functions (one copy dropped
// circles/disabilities and failed response validation) — do not fork
// them again.
//
// inPredicates:
//   personId          - single row by id (p.id = ?)
//   villageId         - scalar home-village restriction (p.villageId = ?)
//   villageIds        - array filter from the ?villageId query param
//   villageIdsGranted - grant scope; null/undefined = federation-wide read
//                       (unrestricted), [] = no grants (empty result),
//                       array = restrict to those villages
//   firstName, lastName, phone, email - LIKE searches
// inOptions:
//   summary           - PersonSummary column set instead of full Person
//   detail            - add the `detail` object to summary rows (getPersons projection)
//   member            - { financial, scNote, inactive } projection gates
//   volunteer         - { inactive } projection gates
//   application       - { member, volunteer } read_application gates (root object; base tables, never active_* views)
//   birthDate         - include p.birthDate (person:read_birth_date)
//   demographics      - include gender/ethnicity/races/isVeteran (person:read_demographics)
async function queryPersons (inPredicates = {}, inOptions = {}) {
  const {
    summary = false, detail = false, member = null, volunteer = null, application = null,
    birthDate = false, demographics = false
  } = inOptions

  const columns = summary
    ? [
      'CAST(p.id AS CHAR) AS personId',
      'p.fullName',
      VILLAGE_COLUMN,
      ACTIVE_AS_COLUMN,
      `JSON_OBJECT('phone', p.phone, 'cell', p.cell) AS phone`,
      'p.email'
    ]
    : [
      'CAST(p.id AS CHAR) AS personId',
      'p.fullName',
      'p.lastName',
      'p.firstName',
      'p.middleInitial',
      'p.nickname',
      'p.street',
      'p.unit',
      'p.address',
      'p.city',
      'p.state',
      "LPAD(p.zip, 5, '0') AS zip",
      'p.town',
      'p.email',
      'p.phone',
      'p.cell',
      'p.emergencyContactName',
      'p.emergencyContactRelationship',
      'p.emergencyContactPhone',
      'p.emergencyContactEmail',
      ...(birthDate ? ["DATE_FORMAT(p.birthDate, '%Y-%m-%d') AS birthDate"] : []),
      ...RECORD_COLUMNS,
      ...(demographics ? DEMOGRAPHICS_COLUMNS : []),
      VILLAGE_COLUMN,
      ACTIVE_AS_COLUMN,
      CIRCLES_COLUMN,
      DISABILITIES_COLUMN
    ]

  if (detail) columns.push(detailColumn({ birthDate, demographics }))
  if (member) columns.push(memberColumn(member))
  if (volunteer) columns.push(volunteerColumn(volunteer))
  if (application) columns.push(applicationColumn(application))

  const joins = new Set([
    'person p',
    'LEFT JOIN village v ON v.id = p.villageId',
    'LEFT JOIN active_member m ON m.personId = p.id',
    'LEFT JOIN active_volunteer vol ON vol.personId = p.id'
  ])
  // The cm/g/e aliases are referenced by the detail projection too, so the
  // joins must be present whenever `detail` is on, not only for full rows.
  if (!summary || detail) RECORD_JOINS.forEach(j => joins.add(j))
  if (demographics) DEMOGRAPHICS_JOINS.forEach(j => joins.add(j))
  const predicates = { statements: [], binds: [] }

  if (inPredicates.personId) {
    predicates.statements.push('p.id = ?')
    predicates.binds.push(inPredicates.personId)
  }
  if (inPredicates.villageId) {
    predicates.statements.push('p.villageId = ?')
    predicates.binds.push(inPredicates.villageId)
  }
  if (inPredicates.villageIds?.length) {
    predicates.statements.push('p.villageId IN (?)')
    predicates.binds.push(inPredicates.villageIds)
  }
  if (inPredicates.villageIdsGranted) {
    // Non-federation caller: restrict to the villages they were granted
    // person:read in. A null/undefined villageIdsGranted means a
    // federation-wide read, which is unrestricted here.
    if (!inPredicates.villageIdsGranted.length) return []
    predicates.statements.push('p.villageId IN (?)')
    predicates.binds.push(inPredicates.villageIdsGranted)
  }
  if (inPredicates.firstName) {
    predicates.statements.push('p.firstName LIKE ?')
    predicates.binds.push(`%${inPredicates.firstName}%`)
  }
  if (inPredicates.lastName) {
    predicates.statements.push('p.lastName LIKE ?')
    predicates.binds.push(`%${inPredicates.lastName}%`)
  }
  if (inPredicates.phone) {
    predicates.statements.push('(p.phone LIKE ? OR p.cell LIKE ?)')
    predicates.binds.push(`%${inPredicates.phone}%`, `%${inPredicates.phone}%`)
  }
  if (inPredicates.email) {
    predicates.statements.push('p.email LIKE ?')
    predicates.binds.push(`%${inPredicates.email}%`)
  }

  const orderBy = ['p.fullName']
  const sql = dbUtils.makeQueryString({ columns, joins, predicates, orderBy, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.getPerson = async function (personId, projections = [], userObject = null) {
  // The member/volunteer projections carry village-scoped gated content:
  // sensitive fields (financial/scNote) and inactive-row visibility
  // (read_inactive), and birthDate is gated the same way
  // (person:read_birth_date). Gates must be evaluated against *this*
  // person's village. getPerson is single-row (predicated on p.id), so that
  // village is a query-level constant — a cheap pre-fetch resolves it
  // before the main query is built. Federation-level grants are covered
  // without the lookup running at all: hasPermission short-circuits on
  // federation membership regardless of villageId.
  const wantsMember = projections.includes('member')
  const wantsVolunteer = projections.includes('volunteer')
  const wantsApplication = projections.includes('application')
  let financial = false
  let scNote = false
  let memberInactive = false
  let volunteerInactive = false
  let memberApplication = false, volunteerApplication = false
  let birthDate = hasPermission(userObject, 'person:read_birth_date')
  let demographics = hasPermission(userObject, 'person:read_demographics')
  if (wantsMember) {
    financial = hasPermission(userObject, 'member:read_financial')
    scNote = hasPermission(userObject, 'member:read_sc_note')
    memberInactive = hasPermission(userObject, 'member:read_inactive')
  }
  if (wantsVolunteer) {
    volunteerInactive = hasPermission(userObject, 'volunteer:read_inactive')
  }
  if (wantsApplication) {
    memberApplication = hasPermission(userObject, 'member:read_application')
    volunteerApplication = hasPermission(userObject, 'volunteer:read_application')
  }
  const unresolved =
    !birthDate || !demographics ||
    (wantsMember && !(financial && scNote && memberInactive)) ||
    (wantsVolunteer && !volunteerInactive) ||
    (wantsApplication && !(memberApplication && volunteerApplication))
  // Without a userObject (internal Member/Volunteer controller calls) every
  // gate stays closed, so the village lookup cannot change anything — skip it.
  if (unresolved && userObject) {
    const [[personVillage]] = await dbUtils.pool.query('SELECT villageId FROM person WHERE id = ?', [personId])
    const villageId = personVillage?.villageId
    birthDate ||= hasPermission(userObject, 'person:read_birth_date', { villageId })
    demographics ||= hasPermission(userObject, 'person:read_demographics', { villageId })
    if (wantsMember) {
      financial ||= hasPermission(userObject, 'member:read_financial', { villageId })
      scNote ||= hasPermission(userObject, 'member:read_sc_note', { villageId })
      memberInactive ||= hasPermission(userObject, 'member:read_inactive', { villageId })
    }
    if (wantsVolunteer) {
      volunteerInactive ||= hasPermission(userObject, 'volunteer:read_inactive', { villageId })
    }
    if (wantsApplication) {
      memberApplication ||= hasPermission(userObject, 'member:read_application', { villageId })
      volunteerApplication ||= hasPermission(userObject, 'volunteer:read_application', { villageId })
    }
  }
  const rows = await queryPersons(
    { personId },
    {
      birthDate,
      demographics,
      member: wantsMember ? { financial, scNote, inactive: memberInactive } : null,
      volunteer: wantsVolunteer ? { inactive: volunteerInactive } : null,
      application: wantsApplication ? { member: memberApplication, volunteer: volunteerApplication } : null
    }
  )
  return rows[0] ?? null
}

// Federation holders see a gated key everywhere; a village-scoped caller sees
// it only when they hold the key for EVERY village in the request's filter
// (the controller guarantees a village caller always supplies villageId).
function keyForVillages (userObject, key, villageIds) {
  if (hasPermission(userObject, key)) return true
  if (!villageIds?.length) return false
  return villageIds.every(v => hasPermission(userObject, key, { villageId: v }))
}

module.exports.getPersons = async function ({ villageIdsGranted, villageId, firstName, lastName, phone, email, projection, userObject }) {
  // 'detail' adds a same-named object with the full person columns (exports).
  // Deliberately no member/volunteer options here: those projections carry
  // per-village-gated fields, and this endpoint can span villages (see
  // getPerson's gate logic). birthDate IS gated here, per-query, because the
  // detail object carries it.
  return queryPersons(
    { villageIdsGranted, villageIds: villageId, firstName, lastName, phone, email },
    {
      summary: true,
      detail: projection?.includes('detail'),
      birthDate: keyForVillages(userObject, 'person:read_birth_date', villageId),
      demographics: keyForVillages(userObject, 'person:read_demographics', villageId),
    }
  )
}

module.exports.getPersonsByVillage = async function (villageId, userObject) {
  return await queryPersons({ villageId }, {
    birthDate: hasPermission(userObject, 'person:read_birth_date', { villageId }),
    demographics: hasPermission(userObject, 'person:read_demographics', { villageId }),
  })
}

module.exports.createPerson = async function (body, userId) {
  const { circles, disabilities, races, languages, contacts, ...personFields } = body
  validateSets({ races, languages, contacts })
  const insertId = await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      return AuditService.auditUpdate(connection, { entityType: 'person', userId }, async () => {
        const [personInsertResult] = await connection.query('INSERT INTO person SET ?', personFields)
        const newPersonId = personInsertResult.insertId
        if (circles?.length) {
          const values = circles.map(circleId => [newPersonId, circleId])
          await connection.query('INSERT INTO person_circle (personId, circleId) VALUES ?', [values])
        }
        if (disabilities?.length) {
          const values = disabilities.map(d => [newPersonId, d.disabilityId, d.note ?? null])
          await connection.query('INSERT INTO person_disability (personId, disabilityId, note) VALUES ?', [values])
        }
        await writeSets(connection, newPersonId, { races, languages, contacts }, { replace: false })
        return newPersonId
      })
    },
    statusObj: undefined
  })
  return insertId
}

module.exports.patchPerson = async function (personId, body, userId) {
  const { circles, disabilities, races, languages, contacts, ...personFields } = body
  validateSets({ races, languages, contacts })
  // town derives from the address (the client recalculates it and sends it
  // with every address edit). A PATCH that changes address fields without
  // supplying town would otherwise keep the previous municipality against
  // the new address — clear it instead.
  if (!('town' in personFields) && ['street', 'city', 'state', 'zip'].some(f => f in personFields)) {
    personFields.town = null
  }
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      await AuditService.auditUpdate(connection,
        { entityType: 'person', entityId: personId, userId, action: 'update' }, async () => {
          if (Object.keys(personFields).length > 0) {
            await connection.query('UPDATE person SET ? WHERE id = ?', [personFields, personId])
          }
          if (circles !== undefined) {
            await connection.query('DELETE FROM person_circle WHERE personId = ?', [personId])
            if (circles.length) {
              const values = circles.map(circleId => [personId, circleId])
              await connection.query('INSERT INTO person_circle (personId, circleId) VALUES ?', [values])
            }
          }
          if (disabilities !== undefined) {
            await connection.query('DELETE FROM person_disability WHERE personId = ?', [personId])
            if (disabilities.length) {
              const values = disabilities.map(d => [personId, d.disabilityId, d.note ?? null])
              await connection.query('INSERT INTO person_disability (personId, disabilityId, note) VALUES ?', [values])
            }
          }
          await writeSets(connection, personId, { races, languages, contacts }, { replace: true })
        })
      // D8: a home-village change revokes village positions that no longer
      // qualify. Positions are audited on the volunteer, so the prune gets
      // its own volunteer auditUpdate; an empty prune diffs to nothing.
      if ('villageId' in personFields) {
        const [vol] = await connection.query('SELECT id FROM volunteer WHERE personId = ?', [personId])
        if (vol.length) {
          await AuditService.auditUpdate(connection, { entityType: 'volunteer', entityId: vol[0].id, userId },
            () => volunteerAssignments.pruneIneligiblePositions(connection, vol[0].id))
        }
      }
    },
    statusObj: undefined
  })
  return personId
}

module.exports.deletePerson = async function (personId, userId) {
  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      await AuditService.auditDelete(connection, { entityType: 'person', entityId: personId, userId },
        () => connection.query('DELETE FROM person WHERE id = ?', [personId]))
      return personId
    },
  })
}
