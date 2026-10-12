'use strict'
// Batch training completions (UI spec §2.4): one date for several
// volunteers, optionally assigning a Hub or village position. Each affected
// volunteer gets its own volunteer audit event inside the one transaction,
// exactly as if the change had been made in the volunteer editor.
const dbUtils = require('./utils')
const SmError = require('../utils/error')
const AuditService = require('./audit/AuditService')

// Person columns shared with PositionHolderService; `hv` = home village.
const PERSON_COLUMNS = `CAST(p.id AS CHAR) AS personId, p.fullName, p.displayName,
  CAST(p.villageId AS CHAR) AS homeVillageId, hv.name AS homeVillageName, v.active`

function personFrom (r) {
  return {
    personId: r.personId,
    fullName: r.fullName,
    displayName: r.displayName,
    village: r.homeVillageId ? { villageId: r.homeVillageId, name: r.homeVillageName } : null,
    active: r.active,
  }
}

// WHERE fragments for a volunteerReadScope() result. `p` = person, `v` = volunteer.
function scopePredicates ({ villageIdsGranted, includeInactive }) {
  const statements = []
  const binds = []
  if (villageIdsGranted) { statements.push('p.villageId IN (?)'); binds.push(villageIdsGranted) }
  if (!includeInactive) statements.push('v.active = 1')
  return { sql: statements.map(s => ` AND ${s}`).join(''), binds }
}

async function listCompletions (trainingId, scope) {
  const where = scopePredicates(scope)
  const [rows] = await dbUtils.pool.query(
    `SELECT CAST(vt.id AS CHAR) AS volunteerTrainingId,
            DATE_FORMAT(vt.completedDate, '%Y-%m-%d') AS completedDate, vt.notes, ${PERSON_COLUMNS}
     FROM volunteer_training vt
     JOIN volunteer v ON v.id = vt.volunteerId
     JOIN person p ON p.id = v.personId
     LEFT JOIN village hv ON hv.id = p.villageId
     WHERE vt.trainingId = ?${where.sql}
     ORDER BY vt.completedDate IS NULL, vt.completedDate DESC, p.fullName`,
    [trainingId, ...where.binds])
  return rows.map(r => ({
    volunteerTrainingId: r.volunteerTrainingId, completedDate: r.completedDate, notes: r.notes, person: personFrom(r),
  }))
}

// Home villages of the requested people, for the controller's write gate.
async function homeVillages (personIds) {
  const [rows] = await dbUtils.pool.query(
    'SELECT CAST(id AS CHAR) AS personId, CAST(villageId AS CHAR) AS villageId FROM person WHERE id IN (?)', [personIds])
  return rows
}

async function recordCompletions (trainingId, { completedDate, notes = null, personIds, positionId = null }, userId) {
  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [people] = await connection.query(
        `SELECT CAST(p.id AS CHAR) AS personId, p.displayName, CAST(p.villageId AS CHAR) AS villageId, v.id AS volunteerId
         FROM person p LEFT JOIN volunteer v ON v.personId = p.id WHERE p.id IN (?)`, [personIds])
      const byId = new Map(people.map(r => [r.personId, r]))
      const notVolunteers = personIds.filter(id => !byId.get(String(id))?.volunteerId)
      if (notVolunteers.length) {
        const names = notVolunteers.map(id => byId.get(String(id))?.displayName ?? `person ${id}`)
        throw new SmError.UnprocessableError(`Not a volunteer: ${names.join(', ')}`)
      }
      let scope = null
      if (positionId) {
        const [[pos]] = await connection.query('SELECT scope FROM `position` WHERE id = ?', [positionId])
        if (!pos) throw new SmError.UnprocessableError(`Unknown positionId: ${positionId}`)
        if (pos.scope === 'circle') throw new SmError.UnprocessableError('A circle position cannot be assigned from a training batch.')
        scope = pos.scope
      }
      const result = { recorded: [], skipped: [], assigned: [], notAssigned: [] }
      for (const id of personIds) {
        const person = byId.get(String(id))
        await AuditService.auditUpdate(connection, { entityType: 'volunteer', entityId: person.volunteerId, userId }, async () => {
          const [dup] = await connection.query(
            'SELECT id FROM volunteer_training WHERE volunteerId = ? AND trainingId = ? AND completedDate = ?',
            [person.volunteerId, trainingId, completedDate])
          if (dup.length) result.skipped.push(person.personId)
          else {
            await connection.query(
              'INSERT INTO volunteer_training (volunteerId, trainingId, completedDate, notes) VALUES (?, ?, ?, ?)',
              [person.volunteerId, trainingId, completedDate, notes || null])
            result.recorded.push(person.personId)
          }
          if (!scope) return
          const villageId = scope === 'village' ? person.villageId : null
          if (scope === 'village' && villageId === null) {
            result.notAssigned.push({ personId: person.personId, reason: 'noHomeVillage' })
            return
          }
          const [held] = await connection.query(
            'SELECT id FROM volunteer_position WHERE volunteerId = ? AND positionId = ? AND villageId <=> ? AND circleId IS NULL',
            [person.volunteerId, positionId, villageId])
          if (held.length) {
            result.notAssigned.push({ personId: person.personId, reason: 'alreadyHolds' })
            return
          }
          await connection.query(
            'INSERT INTO volunteer_position (volunteerId, positionId, villageId, circleId) VALUES (?, ?, ?, NULL)',
            [person.volunteerId, positionId, villageId])
          result.assigned.push(person.personId)
        })
      }
      return result
    },
  })
}

async function getCompletionRow (trainingId, volunteerTrainingId) {
  const [rows] = await dbUtils.pool.query(
    `SELECT vt.id, vt.volunteerId, CAST(p.villageId AS CHAR) AS villageId
     FROM volunteer_training vt JOIN volunteer v ON v.id = vt.volunteerId JOIN person p ON p.id = v.personId
     WHERE vt.id = ? AND vt.trainingId = ?`, [volunteerTrainingId, trainingId])
  return rows[0] ?? null
}

async function deleteCompletion (row, userId) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: (connection) => AuditService.auditUpdate(connection,
      { entityType: 'volunteer', entityId: row.volunteerId, userId },
      () => connection.query('DELETE FROM volunteer_training WHERE id = ?', [row.id])),
  })
}

module.exports = { PERSON_COLUMNS, personFrom, scopePredicates, listCompletions, homeVillages, recordCompletions, getCompletionRow, deleteCompletion }
