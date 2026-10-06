'use strict'
// Holders on the position (UI spec §2.4). One PATCH adds and removes; each
// add passes the same shape and D8 eligibility rules as the volunteer
// editor. Changes are grouped per volunteer so each gets one audit event.
const dbUtils = require('./utils')
const SmError = require('../utils/error')
const AuditService = require('./audit/AuditService')
const { scopeShapeError, isEligible, assertIdsExist } = require('./volunteerAssignments')
const { PERSON_COLUMNS, personFrom, scopePredicates } = require('./TrainingCompletionService')

const s = (v) => (v === null || v === undefined ? '' : String(v))

async function listHolders (positionId, scope) {
  const where = scopePredicates(scope)
  const [rows] = await dbUtils.pool.query(
    `SELECT CAST(vp.id AS CHAR) AS volunteerPositionId,
            CAST(vp.villageId AS CHAR) AS heldVillageId, pv.name AS heldVillageName,
            CAST(vp.circleId AS CHAR) AS heldCircleId, pc.name AS heldCircleName, ${PERSON_COLUMNS}
     FROM volunteer_position vp
     JOIN volunteer v ON v.id = vp.volunteerId
     JOIN person p ON p.id = v.personId
     LEFT JOIN village hv ON hv.id = p.villageId
     LEFT JOIN village pv ON pv.id = vp.villageId
     LEFT JOIN circle pc ON pc.id = vp.circleId
     WHERE vp.positionId = ?${where.sql}
     ORDER BY pv.name, pc.name, p.fullName`,
    [positionId, ...where.binds])
  return rows.map(r => ({
    volunteerPositionId: r.volunteerPositionId,
    village: r.heldVillageId ? { villageId: r.heldVillageId, name: r.heldVillageName } : null,
    circle: r.heldCircleId ? { circleId: r.heldCircleId, name: r.heldCircleName } : null,
    person: personFrom(r),
  }))
}

// For the controller's per-scope authorization of removals.
async function removalRows (positionId, ids) {
  if (!ids.length) return []
  const [rows] = await dbUtils.pool.query(
    'SELECT CAST(id AS CHAR) AS id, CAST(villageId AS CHAR) AS villageId FROM volunteer_position WHERE id IN (?) AND positionId = ?',
    [ids, positionId])
  return rows
}

async function patchHolders (positionId, { add = [], remove = [] }, userId) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [[pos]] = await connection.query('SELECT scope FROM `position` WHERE id = ?', [positionId])
      const keys = add.map(a => `${s(a.personId)}|${s(a.villageId)}|${s(a.circleId)}`)
      if (new Set(keys).size !== keys.length) throw new SmError.UnprocessableError('The same holder is listed twice.')

      const removeIds = [...new Set(remove.map(String))]
      let removeRows = []
      if (removeIds.length) {
        ;[removeRows] = await connection.query(
          'SELECT id, volunteerId FROM volunteer_position WHERE id IN (?) AND positionId = ?', [removeIds, positionId])
        if (removeRows.length !== removeIds.length) {
          const found = removeRows.map(r => String(r.id))
          throw new SmError.UnprocessableError(`Not a holder of this position: ${removeIds.filter(id => !found.includes(id)).join(', ')}`)
        }
      }

      const personIds = [...new Set(add.map(a => String(a.personId)))]
      const people = new Map()
      if (personIds.length) {
        const [rows] = await connection.query(
          `SELECT CAST(p.id AS CHAR) AS personId, p.displayName, p.villageId, v.id AS volunteerId
           FROM person p LEFT JOIN volunteer v ON v.personId = p.id WHERE p.id IN (?)`, [personIds])
        for (const r of rows) people.set(r.personId, r)
        const missing = personIds.filter(id => !people.get(id)?.volunteerId)
        if (missing.length) {
          throw new SmError.UnprocessableError(`Not a volunteer: ${missing.map(id => people.get(id)?.displayName ?? `person ${id}`).join(', ')}`)
        }
      }
      await assertIdsExist(connection, 'village', 'villageId', [...new Set(add.filter(a => a.villageId != null).map(a => String(a.villageId)))])
      await assertIdsExist(connection, 'circle', 'circleId', [...new Set(add.filter(a => a.circleId != null).map(a => String(a.circleId)))])

      const byVolunteer = new Map() // volunteerId -> { adds: [], removes: [] }
      const bucket = (id) => { if (!byVolunteer.has(id)) byVolunteer.set(id, { adds: [], removes: [] }); return byVolunteer.get(id) }
      for (const r of removeRows) bucket(r.volunteerId).removes.push(r.id)
      for (const a of add) {
        const person = people.get(String(a.personId))
        const err = scopeShapeError(a, pos.scope)
        if (err) throw new SmError.UnprocessableError(`${person.displayName}: ${err}`)
        const [assoc] = await connection.query(
          'SELECT villageId FROM volunteer_village_associate WHERE volunteerId = ?', [person.volunteerId])
        if (!isEligible(a, pos.scope, { homeVillageId: person.villageId, associateVillageIds: assoc.map(x => x.villageId) })) {
          throw new SmError.UnprocessableError(
            `${person.displayName}: village ${a.villageId} is neither their home village nor one of their associate villages`)
        }
        bucket(person.volunteerId).adds.push(a)
      }

      for (const [volunteerId, { adds, removes }] of byVolunteer) {
        await AuditService.auditUpdate(connection, { entityType: 'volunteer', entityId: volunteerId, userId }, async () => {
          if (removes.length) await connection.query('DELETE FROM volunteer_position WHERE id IN (?)', [removes])
          for (const a of adds) {
            // INSERT IGNORE: an add that already exists is a no-op (natural unique key).
            await connection.query(
              'INSERT IGNORE INTO volunteer_position (volunteerId, positionId, villageId, circleId) VALUES (?, ?, ?, ?)',
              [volunteerId, positionId, a.villageId ?? null, a.circleId ?? null])
          }
        })
      }
      return positionId
    },
  })
}

module.exports = { listHolders, removalRows, patchHolders }
