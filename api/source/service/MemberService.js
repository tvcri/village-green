'use strict';
const dbUtils = require('./utils')
const PersonService = require('./PersonService')
const AuditService = require('./audit/AuditService')

// A member is welcomed when they genuinely become Active. Prior 'Active' is the
// hazard this guard exists for: ~712 existing Active members with email would
// otherwise be welcomed the first time each record is touched. Prior 'Dropped'
// is reactivation, which gets no welcome by customer decision.
// See docs/superpowers/specs/2026-08-11-member-welcome-producer-design.md
function isActivation (priorStatus, nextStatus) {
  return nextStatus === 'Active' && priorStatus !== 'Active' && priorStatus !== 'Dropped'
}

// Written on the caller's transaction connection so the event commits with the
// member row — never dbUtils.pool.query. The sidecar resolves the person's
// name, email, and village at send time, so nothing is snapshotted here.
async function writeMemberWelcomeEvent (connection, personId) {
  await connection.query(
    `INSERT INTO notification_event (eventType, serviceRequestId, payload) VALUES (?, NULL, ?)`,
    ['member_welcome', JSON.stringify({ memberPersonId: Number(personId) })]
  )
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
      // status comes back alongside id: it is the before-state the welcome
      // guard compares against. Undefined on the insert branch (no prior row).
      const [existing] = await connection.query(
        'SELECT id, status FROM member WHERE personId = ?', [personId]
      )
      await AuditService.auditUpdate(connection,
        { entityType: 'member', entityId: existing[0]?.id ?? null, userId: userObject.userId },
        async () => {
          // createdId, not an early return: the welcome-event check below must
          // run on the insert branch too — a member created directly in Active
          // is the primary welcome path.
          let createdId
          if (existing.length) {
            if (Object.keys(body).length) {
              await connection.query('UPDATE member SET ? WHERE personId = ?', [body, personId])
            }
          }
          else {
            const [[{ nextNumber }]] = await connection.query(
              'SELECT COALESCE(MAX(CAST(memberNumber AS SIGNED)), 0) + 1 AS nextNumber FROM member FOR UPDATE'
            )
            const [result] = await connection.query('INSERT INTO member SET ?', { personId, memberNumber: String(nextNumber), ...body })
            createdId = result.insertId
          }
          if (isActivation(existing[0]?.status, body.status)) {
            await writeMemberWelcomeEvent(connection, personId)
          }
          return createdId
        })
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['member'], userObject)
}

// Partially update an existing member role.
module.exports.patchMember = async function (personId, body, userObject) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      // Read the before-state inside the transaction: this is the path a
      // Pending -> Active activation actually takes from the client.
      const [existing] = await connection.query(
        'SELECT id, status FROM member WHERE personId = ?', [personId]
      )
      const memberId = existing[0]?.id
      // No member row: the mutation is a no-op UPDATE and there is no entity
      // to audit, so it runs unwrapped (auditUpdate would demand a new id).
      const mutate = async () => {
        if (Object.keys(body).length) {
          await connection.query('UPDATE member SET ? WHERE personId = ?', [body, personId])
        }
        if (isActivation(existing[0]?.status, body.status)) {
          await writeMemberWelcomeEvent(connection, personId)
        }
      }
      if (memberId) {
        await AuditService.auditUpdate(connection,
          { entityType: 'member', entityId: memberId, userId: userObject.userId, action: 'update' }, mutate)
      } else {
        await mutate()
      }
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['member'], userObject)
}

module.exports.deleteMember = async function (personId, userId) {
  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [rows] = await connection.query('SELECT id FROM member WHERE personId = ?', [personId])
      const memberId = rows[0]?.id
      if (!memberId) return personId
      await AuditService.auditDelete(connection, { entityType: 'member', entityId: memberId, userId },
        () => connection.query('DELETE FROM member WHERE personId = ?', [personId]))
      return personId
    },
  })
}
