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
    'p.zip',
    'p.email',
    'p.phone',
    'p.cell',
    "DATE_FORMAT(p.birth_date, '%Y-%m-%d') AS birthDate",
    "DATE_FORMAT(p.join_date, '%Y-%m-%d') AS joinDate",
    `CAST(
      CONCAT('[', GROUP_CONCAT(DISTINCT CAST(pv.village_id AS CHAR) ORDER BY pv.village_id), ']')
      AS JSON) AS villageIds`
  ]
  const joins = new Set([
    'person p',
    'LEFT JOIN person_village pv ON pv.person_id = p.id'
  ])
  const groupBy = ['p.id']
  const orderBy = ['p.full_name']
  const predicates = { statements: [], binds: [] }

  if (inPredicates?.personId) {
    predicates.statements.push('p.id = ?')
    predicates.binds.push(inPredicates.personId)
  }

  const sql = dbUtils.makeQueryString({columns, joins, predicates, groupBy, orderBy, format: true})
  let [rows] = await dbUtils.pool.query(sql)
  rows = rows.map(r => ({...r, villageIds: r.villageIds ?? []}))
  return rows
}

module.exports.getPersons = async function () {
  return await queryPersons({})
}

module.exports.getPerson = async function (personId) {
  const rows = await queryPersons({personId})
  return rows[0] ?? null
}

module.exports.createPerson = async function (body) {
  const insertId = await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const { villageIds, ...personFields } = body
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

      const [personInsertResult] = await connection.query('INSERT INTO person SET ?', mappedFields)
      const insertId = personInsertResult.insertId

      if (villageIds?.length) {
        const villageValues = villageIds.map(vid => [insertId, vid])
        await connection.query('INSERT INTO person_village (person_id, village_id) VALUES ?', [villageValues])
      }

      return insertId
    },
    statusObj: undefined
  })
  return await queryPersons({personId: insertId})
}

module.exports.patchPerson = async function (personId, body) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const { villageIds, ...personFields } = body

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

module.exports.putPersonVillages = async function (personId, villageIds) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      await connection.query('DELETE FROM person_village WHERE person_id = ?', [personId])

      if (villageIds?.length) {
        const villageValues = villageIds.map(vid => [personId, vid])
        await connection.query('INSERT INTO person_village (person_id, village_id) VALUES ?', [villageValues])
      }
    },
    statusObj: undefined
  })
  return await queryPersons({personId})
}
