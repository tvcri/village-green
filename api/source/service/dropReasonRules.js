'use strict'
const SmError = require('../utils/error')
const { assertIdsExist } = require('./volunteerAssignments')

// Drop-reason write rules (spec 5.2), evaluated on the merged result of the
// request, for a member or a volunteer: `table` is 'member_drop_reason' or
// 'volunteer_drop_reason'. `existing` is { status, dropReasonId } read in the
// transaction, or undefined on a create. Mutates `fields`; throws 422.
//  1. Dropped, and the request changes status or sends dropReasonId => a
//     reason is required. An untouched legacy Dropped row saves without one.
//  2. Not Dropped => dropReasonId is cleared (the drop-reason status CHECK on
//     member / volunteer would otherwise reject the UPDATE); the audit trail keeps the old value.
//  3. A retired reason may be written only if the row already carries it.
//  4. An unknown id is 422.
async function applyDropReasonRules (existing, fields, connection, table) {
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
    await assertIdsExist(connection, table, 'dropReasonId', [id])
    if (id !== String(existing?.dropReasonId ?? '')) {
      const [[reason]] = await connection.query(`SELECT retired FROM \`${table}\` WHERE id = ?`, [id])
      if (reason.retired) throw new SmError.UnprocessableError('That drop reason is retired.')
    }
  }
}

module.exports = { applyDropReasonRules }
