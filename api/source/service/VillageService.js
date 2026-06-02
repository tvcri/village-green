'use strict';
const dbUtils = require('./utils')
const PersonService = require('./PersonService')

const _this = this

async function queryVillages (inPredicates = {}) {
  const columns = [
    'CAST(v.id AS CHAR) AS villageId',
    'v.name'
  ]
  const joins = new Set(['village v'])
  const orderBy = ['v.name']
  const predicates = { statements: [], binds: [] }

  if (inPredicates?.villageId) {
    predicates.statements.push('v.id = ?')
    predicates.binds.push(inPredicates.villageId)
  }

  const sql = dbUtils.makeQueryString({columns, joins, predicates, orderBy, format: true})
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.getVillages = async function () {
  return await queryVillages({})
}

module.exports.getVillage = async function (villageId) {
  const rows = await queryVillages({villageId})
  return rows[0] ?? null
}

module.exports.createVillage = async function (body) {
  const insertId = await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const mappedFields = {}
      if (body.name !== undefined) mappedFields.name = body.name

      const [result] = await connection.query('INSERT INTO village SET ?', mappedFields)
      return result.insertId
    },
    statusObj: undefined
  })
  return await queryVillages({villageId: insertId})
}

module.exports.patchVillage = async function (villageId, body) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const mappedFields = {}
      if (body.name !== undefined) mappedFields.name = body.name

      if (Object.keys(mappedFields).length > 0) {
        await connection.query('UPDATE village SET ? WHERE id = ?', [mappedFields, villageId])
      }
    },
    statusObj: undefined
  })
  return await queryVillages({villageId})
}

module.exports.deleteVillage = async function (villageId) {
  await dbUtils.pool.query('DELETE FROM village WHERE id = ?', [villageId])
}

module.exports.getVillageMembers = async function (villageId) {
  const columns = [
    'CAST(m.id AS CHAR) AS memberId',
    'CAST(m.person_id AS CHAR) AS personId',
    'm.member_number AS memberNumber',
    'm.member_level AS memberLevel',
    'm.service_notes AS serviceNotes',
    'm.emergency_contact_name AS emergencyContactName',
    'm.emergency_contact_relationship AS emergencyContactRelationship',
    'm.emergency_contact_phone AS emergencyContactPhone',
    'm.emergency_contact_email AS emergencyContactEmail'
  ]
  const joins = new Set([
    'member m',
    'JOIN person p ON p.id = m.person_id'
  ])
  const predicates = { statements: ['p.village_id = ?'], binds: [villageId] }
  const orderBy = ['p.full_name']
  const sql = dbUtils.makeQueryString({columns, joins, predicates, orderBy, format: true})
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.getVillageVolunteers = async function (villageId) {
  const columns = [
    'CAST(vol.id AS CHAR) AS volunteerId',
    'CAST(vol.person_id AS CHAR) AS personId',
    'vol.emergency_phone AS emergencyPhone',
    `CAST(
      CONCAT('[', GROUP_CONCAT(DISTINCT CAST(vc.capability_id AS CHAR) ORDER BY vc.capability_id), ']')
      AS JSON) AS capabilityIds`
  ]
  const joins = new Set([
    'volunteer vol',
    'JOIN person p ON p.id = vol.person_id',
    'LEFT JOIN volunteer_capability vc ON vc.volunteer_id = vol.id'
  ])
  const predicates = { statements: ['p.village_id = ?'], binds: [villageId] }
  const groupBy = ['vol.id']
  const orderBy = ['p.full_name']
  const sql = dbUtils.makeQueryString({columns, joins, predicates, groupBy, orderBy, format: true})
  let [rows] = await dbUtils.pool.query(sql)
  rows = rows.map(r => ({...r, capabilityIds: r.capabilityIds ?? []}))
  return rows
}

module.exports.getVillagePersons = async function (villageId) {
  return await PersonService.getPersonsByVillage(villageId)
}
