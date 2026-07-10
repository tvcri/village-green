'use strict';
const dbUtils = require('./utils')
const { hasPermission } = require('../utils/authz')

const _this = this

async function queryPersons (inPredicates = {}) {
  const columns = [
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
    'p.email',
    'p.phone',
    'p.cell',
    'p.emergencyContactName',
    'p.emergencyContactRelationship',
    'p.emergencyContactPhone',
    'p.emergencyContactEmail',
    "DATE_FORMAT(p.birthDate, '%Y-%m-%d') AS birthDate",
    `JSON_OBJECT('villageId', CAST(v.id AS CHAR), 'name', v.name) AS village`,
    `CASE
      WHEN m.id IS NOT NULL AND vol.id IS NOT NULL THEN JSON_ARRAY('member','volunteer')
      WHEN m.id IS NOT NULL THEN JSON_ARRAY('member')
      WHEN vol.id IS NOT NULL THEN JSON_ARRAY('volunteer')
      ELSE JSON_ARRAY()
    END AS roles`
  ]
  const joins = new Set([
    'person p',
    'LEFT JOIN village v ON v.id = p.villageId',
    'LEFT JOIN active_member m ON m.personId = p.id',
    'LEFT JOIN active_volunteer vol ON vol.personId = p.id'
  ])
  const orderBy = ['p.fullName']
  const predicates = { statements: [], binds: [] }

  if (inPredicates?.personId) {
    predicates.statements.push('p.id = ?')
    predicates.binds.push(inPredicates.personId)
  }

  if (inPredicates?.villageId) {
    predicates.statements.push('p.villageId = ?')
    predicates.binds.push(inPredicates.villageId)
  }

  const sql = dbUtils.makeQueryString({columns, joins, predicates, orderBy, format: true})
  let [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.getPerson = async function (personId, projections = [], userObject = null) {
  // memberDetail/memberInfo carry village-scoped financial/confidential
  // fields; the gate must be evaluated against *this* person's village.
  // getPerson is single-row (predicated on p.id), so that village is a
  // query-level constant — a cheap pre-fetch resolves it before the main
  // query is built. A userObject holding the federation-level grant (no
  // villageId) is covered without this lookup running at all: hasPermission
  // short-circuits on federation membership regardless of villageId.
  let financial = false
  let confidential = false
  if (projections.includes('memberDetail') || projections.includes('memberInfo')) {
    if (hasPermission(userObject, 'member:read_financial') && hasPermission(userObject, 'person:read_confidential')) {
      financial = true
      confidential = true
    }
    else {
      const [[personVillage]] = await dbUtils.pool.query('SELECT villageId FROM person WHERE id = ?', [personId])
      const villageId = personVillage?.villageId
      financial = hasPermission(userObject, 'member:read_financial', { villageId })
      confidential = hasPermission(userObject, 'person:read_confidential', { villageId })
    }
  }
  const columns = [
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
    'p.email',
    'p.phone',
    'p.cell',
    'p.emergencyContactName',
    'p.emergencyContactRelationship',
    'p.emergencyContactPhone',
    'p.emergencyContactEmail',
    "DATE_FORMAT(p.birthDate, '%Y-%m-%d') AS birthDate",
    `JSON_OBJECT('villageId', CAST(v.id AS CHAR), 'name', v.name) AS village`,
    `CASE
      WHEN m.id IS NOT NULL AND vol.id IS NOT NULL THEN JSON_ARRAY('member','volunteer')
      WHEN m.id IS NOT NULL THEN JSON_ARRAY('member')
      WHEN vol.id IS NOT NULL THEN JSON_ARRAY('volunteer')
      ELSE JSON_ARRAY()
    END AS roles`
  ]
  const joins = new Set([
    'person p',
    'LEFT JOIN village v ON v.id = p.villageId',
    'LEFT JOIN active_member m ON m.personId = p.id',
    'LEFT JOIN active_volunteer vol ON vol.personId = p.id'
  ])
  const predicates = { statements: ['p.id = ?'], binds: [personId] }

  columns.push(`(
    SELECT COALESCE(
      ${dbUtils.jsonArrayAgg({
        value: `JSON_OBJECT('communityId', CAST(c.id AS CHAR), 'name', c.name)`,
        orderBy: 'c.name'
      })},
      JSON_ARRAY()
    )
    FROM person_community pc
    JOIN community c ON c.id = pc.communityId
    WHERE pc.personId = p.id
  ) AS communities`)

  columns.push(`(
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
  ) AS disabilities`)

  if (projections.includes('memberInfo')) {
    columns.push(`(SELECT JSON_OBJECT(
      'memberId', CAST(id AS CHAR),
      'memberNumber', memberNumber,
      'memberLevel', memberLevel,
      'primaryPerson', (
        SELECT JSON_OBJECT('personId', CAST(pp.id AS CHAR), 'fullName', pp.fullName)
        FROM person pp WHERE pp.id = active_member.primaryPersonId
      ),
      'serviceNotes', serviceNotes,
      'joinDate', DATE_FORMAT(joinDate, '%Y-%m-%d')
    ) FROM active_member WHERE personId = p.id) AS memberInfo`)
  }

  if (projections.includes('memberDetail')) {
    columns.push(`(SELECT JSON_OBJECT(
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
      'serviceNotes', m2.serviceNotes,
      'joinDate', DATE_FORMAT(m2.joinDate, '%Y-%m-%d'),
      'createdDate', DATE_FORMAT(m2.createdDate, '%Y-%m-%d'),
      'status', m2.status,
      'dropReason', m2.dropReason,
      'householdSize', m2.householdSize,
      'quickbooksKey', m2.quickbooksKey,
      'printedNewsletter', m2.printedNewsletter != 0,
      ${confidential ? `'confidentialNotes', m2.confidentialNotes,` : ''}
      'statusChangeNotes', m2.statusChangeNotes,
      'miscNotes', m2.miscNotes
    ) FROM member m2 WHERE m2.personId = p.id) AS memberDetail`)
  }

  if (projections.includes('volunteerInfo')) {
    columns.push(`(SELECT JSON_OBJECT(
      'volunteerId', CAST(vol2.id AS CHAR),
      'capabilities', (
        SELECT COALESCE(
          CAST(CONCAT('[', GROUP_CONCAT(CONCAT('"', c.name, '"') ORDER BY c.name), ']') AS JSON),
          JSON_ARRAY()
        )
        FROM volunteer_capability vc
        JOIN capability c ON c.id = vc.capabilityId
        WHERE vc.volunteerId = vol2.id
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
        WHERE vva.volunteerId = vol2.id
      )
    ) FROM active_volunteer vol2 WHERE vol2.personId = p.id) AS volunteerInfo`)
  }

  if (projections.includes('volunteerDetail')) {
    columns.push(`(SELECT JSON_OBJECT(
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
      )
    ) FROM volunteer vol3 WHERE vol3.personId = p.id) AS volunteerDetail`)
  }

  const sql = dbUtils.makeQueryString({ columns, joins, predicates, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows[0] ?? null
}

module.exports.getPersonsByVillage = async function (villageId) {
  return await queryPersons({villageId})
}

module.exports.createPerson = async function (body) {
  const { communities, disabilities, ...personFields } = body
  const insertId = await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [personInsertResult] = await connection.query('INSERT INTO person SET ?', personFields)
      const newPersonId = personInsertResult.insertId
      if (communities?.length) {
        const values = communities.map(communityId => [newPersonId, communityId])
        await connection.query('INSERT INTO person_community (personId, communityId) VALUES ?', [values])
      }
      if (disabilities?.length) {
        const values = disabilities.map(d => [newPersonId, d.disabilityId, d.note ?? null])
        await connection.query('INSERT INTO person_disability (personId, disabilityId, note) VALUES ?', [values])
      }
      return newPersonId
    },
    statusObj: undefined
  })
  return insertId
}

module.exports.patchPerson = async function (personId, body) {
  const { communities, disabilities, ...personFields } = body
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      if (Object.keys(personFields).length > 0) {
        await connection.query('UPDATE person SET ? WHERE id = ?', [personFields, personId])
      }
      if (communities !== undefined) {
        await connection.query('DELETE FROM person_community WHERE personId = ?', [personId])
        if (communities.length) {
          const values = communities.map(communityId => [personId, communityId])
          await connection.query('INSERT INTO person_community (personId, communityId) VALUES ?', [values])
        }
      }
      if (disabilities !== undefined) {
        await connection.query('DELETE FROM person_disability WHERE personId = ?', [personId])
        if (disabilities.length) {
          const values = disabilities.map(d => [personId, d.disabilityId, d.note ?? null])
          await connection.query('INSERT INTO person_disability (personId, disabilityId, note) VALUES ?', [values])
        }
      }
    },
    statusObj: undefined
  })
  return personId
}

module.exports.deletePerson = async function (personId) {
  await dbUtils.pool.query('DELETE FROM person WHERE id = ?', [personId])
}

module.exports.getPersons = async function ({ villageIdsGranted, villageId, firstName, lastName, phone, email, role }) {
  const columns = [
    'CAST(p.id AS CHAR) AS personId',
    'p.fullName',
    `JSON_OBJECT('villageId', CAST(v.id AS CHAR), 'name', v.name) AS village`,
    `CASE
      WHEN m.id IS NOT NULL AND vol.id IS NOT NULL THEN JSON_ARRAY('member','volunteer')
      WHEN m.id IS NOT NULL THEN JSON_ARRAY('member')
      WHEN vol.id IS NOT NULL THEN JSON_ARRAY('volunteer')
      ELSE JSON_ARRAY()
    END AS roles`,
    `JSON_OBJECT('phone', p.phone, 'cell', p.cell) AS phone`,
    'p.email'
  ]
  const joins = new Set([
    'person p',
    'LEFT JOIN village v ON v.id = p.villageId',
    'LEFT JOIN active_member m ON m.personId = p.id',
    'LEFT JOIN active_volunteer vol ON vol.personId = p.id'
  ])
  const predicates = { statements: [], binds: [] }

  if (villageIdsGranted !== null) {
    // Non-federation caller: restrict to the villages they were granted
    // person:read in. villageIdsGranted === null means a federation-wide
    // read, which is unrestricted here.
    if (!villageIdsGranted.length) return []
    predicates.statements.push('p.villageId IN (?)')
    predicates.binds.push(villageIdsGranted)
  }
  if (villageId && villageId.length > 0) {
    predicates.statements.push('p.villageId IN (?)')
    predicates.binds.push(villageId)
  }
  if (firstName) {
    predicates.statements.push('p.firstName LIKE ?')
    predicates.binds.push(`%${firstName}%`)
  }
  if (lastName) {
    predicates.statements.push('p.lastName LIKE ?')
    predicates.binds.push(`%${lastName}%`)
  }
  if (phone) {
    predicates.statements.push('(p.phone LIKE ? OR p.cell LIKE ?)')
    predicates.binds.push(`%${phone}%`, `%${phone}%`)
  }
  if (email) {
    predicates.statements.push('p.email LIKE ?')
    predicates.binds.push(`%${email}%`)
  }

  if (role === 'member') {
    predicates.statements.push('m.id IS NOT NULL')
  }
  else if (role === 'volunteer') {
    predicates.statements.push('vol.id IS NOT NULL')
  }
  else if (role === 'community') {
    // EXISTS rather than a JOIN: a person with N community memberships would
    // otherwise produce N duplicate rows (community is M:N, unlike the 1:1
    // member/volunteer roles).
    predicates.statements.push('EXISTS (SELECT 1 FROM person_community pc WHERE pc.personId = p.id)')
  }

  const orderBy = ['p.fullName']
  const sql = dbUtils.makeQueryString({ columns, joins, predicates, orderBy, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}
