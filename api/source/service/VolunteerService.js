'use strict';
const dbUtils = require('./utils')
const PersonService = require('./PersonService')
const AuditService = require('./audit/AuditService')
const volunteerAssignments = require('./volunteerAssignments')
const { applyDropReasonRules } = require('./dropReasonRules')
const SmError = require('../utils/error')

// Ensure a volunteer row exists for the person; return its id.
async function ensureVolunteer (connection, personId, status) {
  const [existing] = await connection.query(
    'SELECT id FROM volunteer WHERE personId = ?', [personId]
  )
  if (existing.length) return existing[0].id
  const [res] = await connection.query(
    'INSERT INTO volunteer SET ?', status === undefined ? { personId } : { personId, status }
  )
  return res.insertId
}

// Full-array replace of capabilities for a volunteer.
async function replaceCapabilities (connection, volunteerId, capabilityIds) {
  await connection.query(
    'DELETE FROM volunteer_capability WHERE volunteerId = ?', [volunteerId]
  )
  if (capabilityIds?.length) {
    const values = capabilityIds.map(id => [volunteerId, id])
    await connection.query(
      'INSERT INTO volunteer_capability (volunteerId, capabilityId) VALUES ?', [values]
    )
  }
}

// D8 eligibility context: the home village plus the associate villages as
// they stand inside this transaction (after this request's associate write).
async function eligibilityContext (connection, personId, volunteerId) {
  const [[person]] = await connection.query('SELECT villageId FROM person WHERE id = ?', [personId])
  const [assoc] = await connection.query(
    'SELECT villageId FROM volunteer_village_associate WHERE volunteerId = ?', [volunteerId])
  return { homeVillageId: person?.villageId ?? null, associateVillageIds: assoc.map(a => a.villageId) }
}

// Full-array replace of associate villages for a volunteer.
async function replaceAssociateVillages (connection, volunteerId, villageIds) {
  await connection.query(
    'DELETE FROM volunteer_village_associate WHERE volunteerId = ?', [volunteerId]
  )
  if (villageIds?.length) {
    const values = villageIds.map(id => [volunteerId, id])
    await connection.query(
      'INSERT INTO volunteer_village_associate (volunteerId, villageId) VALUES ?', [values]
    )
  }
}

// Full-array replace of vettings for a volunteer.
async function replaceVettings (connection, volunteerId, vettings) {
  await connection.query(
    'DELETE FROM volunteer_vetting WHERE volunteerId = ?', [volunteerId]
  )
  if (vettings?.length) {
    const values = vettings.map(v => [volunteerId, v.vettingTypeId, v.dateEntered ?? null, v.dateExpired ?? null,
      v.additionalData ?? null, v.notes ?? null])
    await connection.query(
      'INSERT INTO volunteer_vetting (volunteerId, vettingTypeId, dateEntered, dateExpired, additionalData, notes) VALUES ?', [values]
    )
  }
}

// A pause belongs to an Active volunteer only: any write that sends a status
// other than Active removes it, and re-activating does not bring it back.
async function clearPauseUnlessActive (connection, volunteerId, status) {
  if (status === undefined || status === 'Active') return
  await connection.query('DELETE FROM volunteer_pause WHERE volunteerId = ?', [volunteerId])
}

module.exports.volunteerExists = async function (personId) {
  const [rows] = await dbUtils.pool.query(
    'SELECT id FROM volunteer WHERE personId = ?', [personId]
  )
  return rows.length > 0
}

// Grant or fully replace the volunteer role (capabilities + associates wholesale).
module.exports.putVolunteer = async function (personId, { providerType = null, status, dropReasonId, statusChangeNotes, notes = null, capabilityIds = [], associateVillageIds = [], vettings = [], trainings = [], positions = [], application } = {}, userObject) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [pre] = await connection.query(
        'SELECT id, status, CAST(dropReasonId AS CHAR) AS dropReasonId FROM volunteer WHERE personId = ?', [personId])
      const preexisting = pre[0]?.id
      // Drop-reason fields follow the same rule as status: written only when sent.
      const dropFields = {}
      if (status !== undefined) dropFields.status = status
      if (dropReasonId !== undefined) dropFields.dropReasonId = dropReasonId
      await applyDropReasonRules(pre[0], dropFields, connection, 'volunteer_drop_reason')
      await AuditService.auditUpdate(connection,
        { entityType: 'volunteer', entityId: preexisting ?? null, userId: userObject.userId },
        async () => {
          // Insert lets the column default (Pending) apply when status is absent;
          // an update writes status only when sent, so a PUT without it never
          // demotes an existing volunteer.
          const volunteerId = await ensureVolunteer(connection, personId, status)
          const putFields = { providerType, notes }
          if (status !== undefined) putFields.status = status
          if ('dropReasonId' in dropFields) putFields.dropReasonId = dropFields.dropReasonId
          if (statusChangeNotes !== undefined) putFields.statusChangeNotes = statusChangeNotes
          await connection.query('UPDATE volunteer SET ? WHERE id = ?', [putFields, volunteerId])
          await clearPauseUnlessActive(connection, volunteerId, status)
          // Written only when sent: a PUT from the volunteer form (which never
          // carries it) must not null the stored application.
          if (application !== undefined) {
            await connection.query('UPDATE volunteer SET application = ? WHERE id = ?',
              [application === null ? null : JSON.stringify(application), volunteerId])
          }
          await replaceCapabilities(connection, volunteerId, capabilityIds)
          await replaceAssociateVillages(connection, volunteerId, associateVillageIds)
          await replaceVettings(connection, volunteerId, vettings)
          await volunteerAssignments.applyTrainings(connection, volunteerId, trainings)
          await volunteerAssignments.applyPositions(connection, volunteerId, positions,
            await eligibilityContext(connection, personId, volunteerId))
          return volunteerId
        })
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['volunteer'], userObject)
}

// Partial update: replace only the fields/arrays that are present.
module.exports.patchVolunteer = async function (personId, body = {}, userObject) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [pre] = await connection.query(
        'SELECT id, status, CAST(dropReasonId AS CHAR) AS dropReasonId FROM volunteer WHERE personId = ?', [personId])
      const preexisting = pre[0]?.id
      const fields = {}
      if (body.providerType !== undefined) fields.providerType = body.providerType
      if (body.status !== undefined) fields.status = body.status
      if (body.dropReasonId !== undefined) fields.dropReasonId = body.dropReasonId
      if (body.statusChangeNotes !== undefined) fields.statusChangeNotes = body.statusChangeNotes
      await applyDropReasonRules(pre[0], fields, connection, 'volunteer_drop_reason')
      await AuditService.auditUpdate(connection,
        { entityType: 'volunteer', entityId: preexisting ?? null, userId: userObject.userId },
        async () => {
          const volunteerId = await ensureVolunteer(connection, personId)
          if (body.notes !== undefined) fields.notes = body.notes
          if (body.application !== undefined) fields.application = body.application === null ? null : JSON.stringify(body.application)
          if (Object.keys(fields).length) {
            await connection.query('UPDATE volunteer SET ? WHERE id = ?', [fields, volunteerId])
          }
          await clearPauseUnlessActive(connection, volunteerId, body.status)
          if (body.capabilityIds !== undefined) {
            await replaceCapabilities(connection, volunteerId, body.capabilityIds)
          }
          if (body.associateVillageIds !== undefined) {
            await replaceAssociateVillages(connection, volunteerId, body.associateVillageIds)
          }
          if (body.vettings !== undefined) {
            await replaceVettings(connection, volunteerId, body.vettings)
          }
          if (body.trainings !== undefined) {
            await volunteerAssignments.applyTrainings(connection, volunteerId, body.trainings)
          }
          if (body.positions !== undefined) {
            await volunteerAssignments.applyPositions(connection, volunteerId, body.positions,
              await eligibilityContext(connection, personId, volunteerId))
          }
          if (body.associateVillageIds !== undefined && body.positions === undefined) {
            await volunteerAssignments.pruneIneligiblePositions(connection, volunteerId)
          }
          return volunteerId
        })
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['volunteer'], userObject)
}

module.exports.deleteVolunteer = async function (personId, userId) {
  // volunteer_capability and volunteer_village_associate cascade on volunteer delete
  // (associate has ON DELETE CASCADE; capability is cleared explicitly for safety).
  // volunteer_vetting and volunteer_training are likewise cleared explicitly.
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [rows] = await connection.query(
        'SELECT id FROM volunteer WHERE personId = ?', [personId]
      )
      if (!rows.length) return
      const volunteerId = rows[0].id
      await AuditService.auditDelete(connection, { entityType: 'volunteer', entityId: volunteerId, userId },
        async () => {
          await connection.query('DELETE FROM volunteer_pause WHERE volunteerId = ?', [volunteerId])
          await connection.query('DELETE FROM volunteer_capability WHERE volunteerId = ?', [volunteerId])
          await connection.query('DELETE FROM volunteer_village_associate WHERE volunteerId = ?', [volunteerId])
          await connection.query('DELETE FROM volunteer_training WHERE volunteerId = ?', [volunteerId])
          await connection.query('DELETE FROM volunteer_position WHERE volunteerId = ?', [volunteerId])
          await connection.query('DELETE FROM volunteer_vetting WHERE volunteerId = ?', [volunteerId])
          await connection.query('DELETE FROM volunteer WHERE id = ?', [volunteerId])
        })
    },
    statusObj: undefined
  })
}

async function readPause (personId) {
  const [rows] = await dbUtils.pool.query(
    `SELECT DATE_FORMAT(vp.startDate, '%Y-%m-%d') AS startDate,
            DATE_FORMAT(vp.endDate, '%Y-%m-%d') AS endDate, vp.scope
     FROM volunteer_pause vp JOIN volunteer v ON v.id = vp.volunteerId
     WHERE v.personId = ?`, [personId])
  return rows[0] ?? null
}

// Create or replace the pause. The controller has already 404'd a missing
// volunteer; rules are checked in the order the spec lists them.
module.exports.putVolunteerPause = async function (personId, { startDate = null, endDate = null, scope }, userObject) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [[vol]] = await connection.query('SELECT id, status FROM volunteer WHERE personId = ? FOR UPDATE', [personId])
      if (!vol) throw new SmError.NotFoundError()
      if (vol.status !== 'Active') throw new SmError.UnprocessableError('Only an Active volunteer can be paused.')
      if (scope === 'window' && (!startDate || !endDate)) {
        throw new SmError.UnprocessableError('A date-window pause needs a start and an end date.')
      }
      if (startDate && endDate && startDate > endDate) {
        throw new SmError.UnprocessableError('The start date must be on or before the end date.')
      }
      await AuditService.auditUpdate(connection,
        { entityType: 'volunteer', entityId: vol.id, userId: userObject.userId },
        async () => {
          await connection.query(
            `INSERT INTO volunteer_pause (volunteerId, startDate, endDate, scope) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE startDate = VALUES(startDate), endDate = VALUES(endDate), scope = VALUES(scope)`,
            [vol.id, startDate, endDate, scope])
          return vol.id
        })
    },
    statusObj: undefined
  })
  return await readPause(personId)
}

// Idempotent: audited only when a row existed.
module.exports.deleteVolunteerPause = async function (personId, userId) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [[vol]] = await connection.query(
        `SELECT v.id, EXISTS (SELECT 1 FROM volunteer_pause vp WHERE vp.volunteerId = v.id) AS paused
         FROM volunteer v WHERE v.personId = ?`, [personId])
      if (!vol || !vol.paused) return
      await AuditService.auditUpdate(connection, { entityType: 'volunteer', entityId: vol.id, userId },
        async () => {
          await connection.query('DELETE FROM volunteer_pause WHERE volunteerId = ?', [vol.id])
          return vol.id
        })
    },
    statusObj: undefined
  })
}
