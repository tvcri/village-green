'use strict';
const dbUtils = require('./utils')

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

module.exports.getPerson = async function (personId, projections = []) {
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

  if (projections.includes('memberInfo')) {
    columns.push(`(SELECT JSON_OBJECT(
      'memberId', CAST(id AS CHAR),
      'memberNumber', memberNumber,
      'memberLevel', memberLevel,
      'serviceNotes', serviceNotes,
      'joinDate', DATE_FORMAT(joinDate, '%Y-%m-%d')
    ) FROM active_member WHERE personId = p.id) AS memberInfo`)
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

  if (projections.includes('communityInfo')) {
    columns.push(`(
      SELECT COALESCE(
        CAST(CONCAT('[', GROUP_CONCAT(
          JSON_OBJECT('communityId', CAST(c.id AS CHAR), 'name', c.name) ORDER BY c.name
        ), ']') AS JSON),
        JSON_ARRAY()
      )
      FROM person_community pc
      JOIN community c ON c.id = pc.communityId
      WHERE pc.personId = p.id
    ) AS communityInfo`)
  }

  const sql = dbUtils.makeQueryString({ columns, joins, predicates, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows[0] ?? null
}

module.exports.getPersonsByVillage = async function (villageId) {
  return await queryPersons({villageId})
}

module.exports.createPerson = async function (body) {
  const insertId = await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [personInsertResult] = await connection.query('INSERT INTO person SET ?', body)
      return personInsertResult.insertId
    },
    statusObj: undefined
  })
  return await queryPersons({personId: insertId})
}

module.exports.patchPerson = async function (personId, body) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      if (Object.keys(body).length > 0) {
        await connection.query('UPDATE person SET ? WHERE id = ?', [body, personId])
      }
    },
    statusObj: undefined
  })
  return await queryPersons({personId})
}

module.exports.deletePerson = async function (personId) {
  await dbUtils.pool.query('DELETE FROM person WHERE id = ?', [personId])
}

module.exports.getPersons = async function ({ villageIdsGranted, elevate, villageId, firstName, lastName, phone, email, role }) {
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

  if (!elevate) {
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
