'use strict';
const dbUtils = require('./utils')
const PersonService = require('./PersonService')

// Map camelCase member attributes to snake_case columns.
function mapMemberFields (body) {
  const fields = {}
  if (body.memberNumber !== undefined) fields.member_number = body.memberNumber
  if (body.memberLevel  !== undefined) fields.member_level  = body.memberLevel
  if (body.serviceNotes !== undefined) fields.service_notes = body.serviceNotes
  if (body.joinDate     !== undefined) fields.join_date     = body.joinDate
  return fields
}

module.exports.personHasHomeVillage = async function (personId) {
  const [rows] = await dbUtils.pool.query(
    'SELECT village_id FROM person WHERE id = ?', [personId]
  )
  return rows.length > 0 && rows[0].village_id !== null
}

module.exports.memberExists = async function (personId) {
  const [rows] = await dbUtils.pool.query(
    'SELECT id FROM member WHERE person_id = ?', [personId]
  )
  return rows.length > 0
}

// Grant or fully replace the member role.
module.exports.putMember = async function (personId, body) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const fields = mapMemberFields(body)
      const [existing] = await connection.query(
        'SELECT id FROM member WHERE person_id = ?', [personId]
      )
      if (existing.length) {
        if (Object.keys(fields).length) {
          await connection.query('UPDATE member SET ? WHERE person_id = ?', [fields, personId])
        }
      }
      else {
        await connection.query('INSERT INTO member SET ?', { person_id: personId, ...fields })
      }
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['memberInfo'])
}

// Partially update an existing member role.
module.exports.patchMember = async function (personId, body) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const fields = mapMemberFields(body)
      if (Object.keys(fields).length) {
        await connection.query('UPDATE member SET ? WHERE person_id = ?', [fields, personId])
      }
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['memberInfo'])
}

module.exports.deleteMember = async function (personId) {
  await dbUtils.pool.query('DELETE FROM member WHERE person_id = ?', [personId])
}
