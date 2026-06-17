'use strict';
const dbUtils = require('./utils')

const _this = this

async function queryPersons (inPredicates = {}) {
  const columns = [
    'CAST(p.id AS CHAR) AS personId',
    'p.full_name AS fullName',
    'p.last_name AS lastName',
    'p.first_name AS firstName',
    'p.nickname',
    'p.address',
    'p.city',
    'p.state',
    "LPAD(p.zip, 5, '0') AS zip",
    'p.email',
    'p.phone',
    'p.cell',
    'p.emergency_contact_name AS emergencyContactName',
    'p.emergency_contact_relationship AS emergencyContactRelationship',
    'p.emergency_contact_phone AS emergencyContactPhone',
    'p.emergency_contact_email AS emergencyContactEmail',
    "DATE_FORMAT(p.birth_date, '%Y-%m-%d') AS birthDate",
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
    'JOIN village v ON v.id = p.village_id',
    'LEFT JOIN member m ON m.person_id = p.id',
    'LEFT JOIN volunteer vol ON vol.person_id = p.id'
  ])
  const orderBy = ['p.full_name']
  const predicates = { statements: [], binds: [] }

  if (inPredicates?.personId) {
    predicates.statements.push('p.id = ?')
    predicates.binds.push(inPredicates.personId)
  }

  if (inPredicates?.villageId) {
    predicates.statements.push('p.village_id = ?')
    predicates.binds.push(inPredicates.villageId)
  }

  const sql = dbUtils.makeQueryString({columns, joins, predicates, orderBy, format: true})
  let [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.getPersons = async function () {
  return await queryPersons({})
}

module.exports.getPerson = async function (personId) {
  const rows = await queryPersons({personId})
  return rows[0] ?? null
}

module.exports.getPersonsByVillage = async function (villageId) {
  return await queryPersons({villageId})
}

module.exports.createPerson = async function (body) {
  const insertId = await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const { villageId, ...personFields } = body
      const mappedFields = {}
      if (personFields.fullName !== undefined) mappedFields.full_name = personFields.fullName
      if (personFields.lastName !== undefined) mappedFields.last_name = personFields.lastName
      if (personFields.firstName !== undefined) mappedFields.first_name = personFields.firstName
      if (personFields.nickname !== undefined) mappedFields.nickname = personFields.nickname
      if (personFields.address !== undefined) mappedFields.address = personFields.address
      if (personFields.city !== undefined) mappedFields.city = personFields.city
      if (personFields.state !== undefined) mappedFields.state = personFields.state
      if (personFields.zip !== undefined) mappedFields.zip = personFields.zip
      if (personFields.email !== undefined) mappedFields.email = personFields.email
      if (personFields.phone !== undefined) mappedFields.phone = personFields.phone
      if (personFields.cell !== undefined) mappedFields.cell = personFields.cell
      if (personFields.birthDate !== undefined) mappedFields.birth_date = personFields.birthDate
      if (personFields.joinDate !== undefined) mappedFields.join_date = personFields.joinDate
      if (villageId !== undefined) mappedFields.village_id = villageId

      const [personInsertResult] = await connection.query('INSERT INTO person SET ?', mappedFields)
      const insertId = personInsertResult.insertId

      return insertId
    },
    statusObj: undefined
  })
  return await queryPersons({personId: insertId})
}

module.exports.patchPerson = async function (personId, body) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const { villageId, ...personFields } = body

      const mappedFields = {}
      if (personFields.fullName !== undefined) mappedFields.full_name = personFields.fullName
      if (personFields.lastName !== undefined) mappedFields.last_name = personFields.lastName
      if (personFields.firstName !== undefined) mappedFields.first_name = personFields.firstName
      if (personFields.nickname !== undefined) mappedFields.nickname = personFields.nickname
      if (personFields.address !== undefined) mappedFields.address = personFields.address
      if (personFields.city !== undefined) mappedFields.city = personFields.city
      if (personFields.state !== undefined) mappedFields.state = personFields.state
      if (personFields.zip !== undefined) mappedFields.zip = personFields.zip
      if (personFields.email !== undefined) mappedFields.email = personFields.email
      if (personFields.phone !== undefined) mappedFields.phone = personFields.phone
      if (personFields.cell !== undefined) mappedFields.cell = personFields.cell
      if (personFields.birthDate !== undefined) mappedFields.birth_date = personFields.birthDate
      if (personFields.joinDate !== undefined) mappedFields.join_date = personFields.joinDate
      if (villageId !== undefined) mappedFields.village_id = villageId

      if (Object.keys(mappedFields).length > 0) {
        await connection.query('UPDATE person SET ? WHERE id = ?', [mappedFields, personId])
      }
    },
    statusObj: undefined
  })
  return await queryPersons({personId})
}

module.exports.deletePerson = async function (personId) {
  await dbUtils.pool.query('DELETE FROM person WHERE id = ?', [personId])
}

module.exports.getPersons = async function ({ villageIdsGranted, elevate, villageId, firstName, lastName, phone, email }) {
  const columns = [
    'CAST(p.id AS CHAR) AS personId',
    'p.full_name AS fullName',
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
    'JOIN village v ON v.id = p.village_id',
    'LEFT JOIN member m ON m.person_id = p.id',
    'LEFT JOIN volunteer vol ON vol.person_id = p.id'
  ])
  const predicates = { statements: [], binds: [] }

  if (!elevate) {
    if (!villageIdsGranted.length) return []
    predicates.statements.push('p.village_id IN (?)')
    predicates.binds.push(villageIdsGranted)
  }
  if (villageId && villageId.length > 0) {
    predicates.statements.push('p.village_id IN (?)')
    predicates.binds.push(villageId)
  }
  if (firstName) {
    predicates.statements.push('p.first_name LIKE ?')
    predicates.binds.push(`%${firstName}%`)
  }
  if (lastName) {
    predicates.statements.push('p.last_name LIKE ?')
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

  const orderBy = ['p.full_name']
  const sql = dbUtils.makeQueryString({ columns, joins, predicates, orderBy, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}
