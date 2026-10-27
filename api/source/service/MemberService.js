'use strict';
const dbUtils = require('./utils')
const PersonService = require('./PersonService')
const AuditService = require('./audit/AuditService')
const SmError = require('../utils/error')
const { assertIdsExist } = require('./volunteerAssignments')

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

// Drop-reason write rules (spec 5.2), evaluated on the merged result of the
// request. `existing` is { status, dropReasonId } read in the transaction, or
// undefined on a create. Mutates `fields`; throws 422.
//  1. Dropped, and the request changes status or sends dropReasonId => a
//     reason is required. An untouched legacy Dropped row saves without one.
//  2. Not Dropped => dropReasonId is cleared (chk_member_drop_reason_status
//     would otherwise reject the UPDATE); the audit trail keeps the old value.
//  3. A retired reason may be written only if the row already carries it.
//  4. An unknown id is 422.
async function applyDropReasonRules (existing, fields, connection) {
  const touchesReason = 'dropReasonId' in fields
  const mergedStatus = 'status' in fields ? fields.status : existing?.status
  if (mergedStatus !== 'Dropped') {
    if (touchesReason || existing?.dropReasonId != null) fields.dropReasonId = null
    return
  }
  const statusChanged = 'status' in fields && fields.status !== existing?.status
  const mergedReasonId = touchesReason ? fields.dropReasonId : existing?.dropReasonId
  if ((statusChanged || touchesReason) && mergedReasonId == null) {
    throw new SmError.UnprocessableError('A drop reason is required.')
  }
  if (touchesReason && fields.dropReasonId != null) {
    const id = String(fields.dropReasonId)
    await assertIdsExist(connection, 'member_drop_reason', 'dropReasonId', [id])
    if (id !== String(existing?.dropReasonId ?? '')) {
      const [[reason]] = await connection.query('SELECT retired FROM member_drop_reason WHERE id = ?', [id])
      if (reason.retired) throw new SmError.UnprocessableError('That drop reason is retired.')
    }
  }
}

// Replace the member's circle service preferences. Only called when the body
// carried the key — an absent key leaves the set untouched.
async function replaceCirclePreferences (connection, memberId, circleIds) {
  await connection.query('DELETE FROM member_circle_preference WHERE memberId = ?', [memberId])
  if (circleIds.length) {
    await connection.query('INSERT INTO member_circle_preference (memberId, circleId) VALUES ?',
      [circleIds.map(circleId => [memberId, circleId])])
  }
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
  const { circlePreferences, application, ...fields } = body
  // JSON column: mysql2 would expand an object into `key = val` pairs, so the
  // envelope is stringified. Only written when the key was sent.
  if (application !== undefined) fields.application = application === null ? null : JSON.stringify(application)
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      // status comes back alongside id: it is the before-state the welcome
      // guard compares against. Undefined on the insert branch (no prior row).
      const [existing] = await connection.query(
        'SELECT id, status, CAST(dropReasonId AS CHAR) AS dropReasonId FROM member WHERE personId = ?', [personId]
      )
      await applyDropReasonRules(existing[0], fields, connection)
      await AuditService.auditUpdate(connection,
        { entityType: 'member', entityId: existing[0]?.id ?? null, userId: userObject.userId },
        async () => {
          // createdId, not an early return: the welcome-event check below must
          // run on the insert branch too — a member created directly in Active
          // is the primary welcome path.
          let createdId
          if (existing.length) {
            if (Object.keys(fields).length) {
              await connection.query('UPDATE member SET ? WHERE personId = ?', [fields, personId])
            }
          }
          else {
            const [[{ nextNumber }]] = await connection.query(
              'SELECT COALESCE(MAX(CAST(memberNumber AS SIGNED)), 0) + 1 AS nextNumber FROM member FOR UPDATE'
            )
            const [result] = await connection.query('INSERT INTO member SET ?', { personId, memberNumber: String(nextNumber), ...fields })
            createdId = result.insertId
          }
          if (isActivation(existing[0]?.status, fields.status)) {
            await writeMemberWelcomeEvent(connection, personId)
          }
          const memberId = existing[0]?.id ?? createdId
          if (circlePreferences !== undefined) await replaceCirclePreferences(connection, memberId, circlePreferences)
          return createdId
        })
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['member'], userObject)
}

// Partially update an existing member role.
module.exports.patchMember = async function (personId, body, userObject) {
  const { circlePreferences, application, ...fields } = body
  // JSON column: mysql2 would expand an object into `key = val` pairs, so the
  // envelope is stringified. Only written when the key was sent.
  if (application !== undefined) fields.application = application === null ? null : JSON.stringify(application)
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      // Read the before-state inside the transaction: this is the path a
      // Pending -> Active activation actually takes from the client.
      const [existing] = await connection.query(
        'SELECT id, status, CAST(dropReasonId AS CHAR) AS dropReasonId FROM member WHERE personId = ?', [personId]
      )
      await applyDropReasonRules(existing[0], fields, connection)
      const memberId = existing[0]?.id
      // No member row: the mutation is a no-op UPDATE and there is no entity
      // to audit, so it runs unwrapped (auditUpdate would demand a new id).
      const mutate = async () => {
        if (Object.keys(fields).length) {
          await connection.query('UPDATE member SET ? WHERE personId = ?', [fields, personId])
        }
        if (isActivation(existing[0]?.status, fields.status)) {
          await writeMemberWelcomeEvent(connection, personId)
        }
        if (memberId && circlePreferences !== undefined) await replaceCirclePreferences(connection, memberId, circlePreferences)
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
