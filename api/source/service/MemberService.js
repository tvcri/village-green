'use strict';
const dbUtils = require('./utils')
const PersonService = require('./PersonService')

// A member is welcomed when they genuinely become Active. Prior 'Active' is the
// hazard this guard exists for: ~712 existing Active members with email would
// otherwise be welcomed the first time each record is touched. Prior 'Dropped'
// is reactivation, which gets no welcome by customer decision.
// See docs/superpowers/specs/2026-08-11-member-welcome-producer-design.md
function isActivation (priorStatus, nextStatus) {
  return nextStatus === 'Active' && priorStatus !== 'Active' && priorStatus !== 'Dropped'
}

module.exports.personHasHomeVillage = async function (personId) {
  const [rows] = await dbUtils.pool.query(
    'SELECT villageId FROM person WHERE id = ?', [personId]
  )
  return rows.length > 0 && rows[0].villageId !== null
}

module.exports.memberExists = async function (personId) {
  const [rows] = await dbUtils.pool.query(
    'SELECT id FROM member WHERE personId = ?', [personId]
  )
  return rows.length > 0
}

// Grant or fully replace the member role.
module.exports.putMember = async function (personId, body, userObject) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [existing] = await connection.query(
        'SELECT id FROM member WHERE personId = ?', [personId]
      )
      if (existing.length) {
        if (Object.keys(body).length) {
          await connection.query('UPDATE member SET ? WHERE personId = ?', [body, personId])
        }
      }
      else {
        const [[{ nextNumber }]] = await connection.query(
          'SELECT COALESCE(MAX(CAST(memberNumber AS SIGNED)), 0) + 1 AS nextNumber FROM member FOR UPDATE'
        )
        await connection.query('INSERT INTO member SET ?', { personId, memberNumber: String(nextNumber), ...body })
      }
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['member'], userObject)
}

// Partially update an existing member role.
module.exports.patchMember = async function (personId, body, userObject) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      if (Object.keys(body).length) {
        await connection.query('UPDATE member SET ? WHERE personId = ?', [body, personId])
      }
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['member'], userObject)
}

module.exports.deleteMember = async function (personId) {
  await dbUtils.pool.query('DELETE FROM member WHERE personId = ?', [personId])
}
