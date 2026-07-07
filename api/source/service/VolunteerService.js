'use strict';
const dbUtils = require('./utils')
const PersonService = require('./PersonService')

// Ensure a volunteer row exists for the person; return its id.
async function ensureVolunteer (connection, personId) {
  const [existing] = await connection.query(
    'SELECT id FROM volunteer WHERE personId = ?', [personId]
  )
  if (existing.length) return existing[0].id
  const [res] = await connection.query(
    'INSERT INTO volunteer SET ?', { personId }
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
    const values = vettings.map(v => [volunteerId, v.vettingTypeId, v.dateEntered ?? null, v.dateExpired ?? null])
    await connection.query(
      'INSERT INTO volunteer_vetting (volunteerId, vettingTypeId, dateEntered, dateExpired) VALUES ?', [values]
    )
  }
}

module.exports.volunteerExists = async function (personId) {
  const [rows] = await dbUtils.pool.query(
    'SELECT id FROM volunteer WHERE personId = ?', [personId]
  )
  return rows.length > 0
}

// Grant or fully replace the volunteer role (capabilities + associates wholesale).
module.exports.putVolunteer = async function (personId, { providerType = null, active = null, notes = null, capabilityIds = [], associateVillageIds = [], vettings = [] } = {}) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const volunteerId = await ensureVolunteer(connection, personId)
      await connection.query(
        'UPDATE volunteer SET providerType = ?, active = ?, notes = ? WHERE id = ?', [providerType, active, notes, volunteerId]
      )
      await replaceCapabilities(connection, volunteerId, capabilityIds)
      await replaceAssociateVillages(connection, volunteerId, associateVillageIds)
      await replaceVettings(connection, volunteerId, vettings)
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['volunteerDetail'])
}

// Partial update: replace only the fields/arrays that are present.
module.exports.patchVolunteer = async function (personId, body = {}) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const volunteerId = await ensureVolunteer(connection, personId)
      const fields = {}
      if (body.providerType !== undefined) fields.providerType = body.providerType
      if (body.active !== undefined) fields.active = body.active
      if (body.notes !== undefined) fields.notes = body.notes
      if (Object.keys(fields).length) {
        await connection.query('UPDATE volunteer SET ? WHERE id = ?', [fields, volunteerId])
      }
      if (body.capabilityIds !== undefined) {
        await replaceCapabilities(connection, volunteerId, body.capabilityIds)
      }
      if (body.associateVillageIds !== undefined) {
        await replaceAssociateVillages(connection, volunteerId, body.associateVillageIds)
      }
      if (body.vettings !== undefined) {
        await replaceVettings(connection, volunteerId, body.vettings)
      }
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['volunteerDetail'])
}

module.exports.deleteVolunteer = async function (personId) {
  // volunteer_capability and volunteer_village_associate cascade on volunteer delete
  // (associate has ON DELETE CASCADE; capability is cleared explicitly for safety).
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [rows] = await connection.query(
        'SELECT id FROM volunteer WHERE personId = ?', [personId]
      )
      if (!rows.length) return
      const volunteerId = rows[0].id
      await connection.query('DELETE FROM volunteer_capability WHERE volunteerId = ?', [volunteerId])
      await connection.query('DELETE FROM volunteer_village_associate WHERE volunteerId = ?', [volunteerId])
      await connection.query('DELETE FROM volunteer WHERE id = ?', [volunteerId])
    },
    statusObj: undefined
  })
}
