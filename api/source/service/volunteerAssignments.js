'use strict'
// Volunteer training and position assignments (trainings/positions spec §4.2–4.3).
// The volunteer PUT/PATCH carries full arrays, but they are APPLIED AS A DIFF
// so unchanged rows keep their ids — future per-item endpoints stay additive.
// Pure helpers first; the DB functions below them run on the caller's
// transaction connection.

const SmError = require('../utils/error')
const dbUtils = require('./utils')

const s = (v) => (v === null || v === undefined ? '' : String(v))
const nullIfEmpty = (v) => (v === undefined || v === '' ? null : v)

const trainingKey = (t) => `${s(t.trainingId)}|${s(t.completedDate)}`
const positionKey = (p) => `${s(p.positionId)}|${s(p.villageId)}|${s(p.circleId)}`

function findDuplicateKeys (items, keyFn) {
  const seen = new Set()
  const dups = new Set()
  for (const item of items) {
    const k = keyFn(item)
    if (seen.has(k)) dups.add(k)
    seen.add(k)
  }
  return [...dups]
}

// Matched on (trainingId, completedDate): a date change is a different
// completion, so it is a remove plus an add. A notes-only change updates in
// place and keeps the row id.
function diffTrainings (current, requested) {
  const cur = new Map(current.map(r => [trainingKey(r), r]))
  const req = new Map(requested.map(r => [trainingKey(r), r]))
  const add = []
  const update = []
  for (const [k, r] of req) {
    const c = cur.get(k)
    if (!c) add.push(r)
    else if (nullIfEmpty(c.notes) !== nullIfEmpty(r.notes)) update.push({ id: c.id, notes: nullIfEmpty(r.notes) })
  }
  const remove = [...cur].filter(([k]) => !req.has(k)).map(([, r]) => r)
  return { add, remove, update }
}

function diffPositions (current, requested) {
  const cur = new Map(current.map(r => [positionKey(r), r]))
  const req = new Map(requested.map(r => [positionKey(r), r]))
  return {
    add: [...req].filter(([k]) => !cur.has(k)).map(([, r]) => r),
    remove: [...cur].filter(([k]) => !req.has(k)).map(([, r]) => r),
  }
}

// MySQL can't enforce scope consistency across tables; this does (spec §3).
function scopeShapeError (p, scope) {
  const hasVillage = p.villageId !== null && p.villageId !== undefined
  const hasCircle = p.circleId !== null && p.circleId !== undefined
  if (scope === 'village') {
    if (!hasVillage) return 'a village position needs a villageId'
    if (hasCircle) return 'a village position takes no circle'
  } else if (scope === 'circle') {
    if (!hasCircle) return 'a circle position needs a circleId'
    if (hasVillage) return 'a circle position takes no village'
  } else if (hasVillage || hasCircle) {
    return 'a Hub (federation) position takes no village or circle'
  }
  return null
}

// D8: a village-scoped position must be in the home village or an associate
// village. Hub and circle positions have no village association.
function isEligible (p, scope, { homeVillageId, associateVillageIds = [] }) {
  if (scope !== 'village') return true
  if (p.villageId === null || p.villageId === undefined) return false
  const v = s(p.villageId)
  return v === s(homeVillageId) || associateVillageIds.map(s).includes(v)
}

async function loadTrainings (connection, volunteerId) {
  const [rows] = await connection.query(
    `SELECT id, trainingId, DATE_FORMAT(completedDate, '%Y-%m-%d') AS completedDate, notes
     FROM volunteer_training WHERE volunteerId = ?`, [volunteerId])
  return rows
}

async function applyTrainings (connection, volunteerId, requested) {
  if (findDuplicateKeys(requested, trainingKey).length) {
    throw new SmError.UnprocessableError('The same training is listed twice with the same completion date (or twice undated).')
  }
  const ids = [...new Set(requested.map(t => String(t.trainingId)))]
  if (ids.length) {
    const [known] = await connection.query('SELECT CAST(id AS CHAR) AS id FROM training WHERE id IN (?)', [ids])
    const missing = ids.filter(id => !known.some(k => k.id === id))
    if (missing.length) throw new SmError.UnprocessableError(`Unknown trainingId: ${missing.join(', ')}`)
  }
  const { add, remove, update } = diffTrainings(await loadTrainings(connection, volunteerId), requested)
  if (remove.length) {
    await connection.query('DELETE FROM volunteer_training WHERE id IN (?)', [remove.map(r => r.id)])
  }
  for (const u of update) {
    await connection.query('UPDATE volunteer_training SET notes = ? WHERE id = ?', [u.notes, u.id])
  }
  if (add.length) {
    await connection.query(
      'INSERT INTO volunteer_training (volunteerId, trainingId, completedDate, notes) VALUES ?',
      [add.map(t => [volunteerId, t.trainingId, t.completedDate ?? null, nullIfEmpty(t.notes)])])
  }
}

async function loadPositions (connection, volunteerId) {
  const [rows] = await connection.query(
    `SELECT vp.id, vp.positionId, vp.villageId, vp.circleId, pos.scope
     FROM volunteer_position vp JOIN \`position\` pos ON pos.id = vp.positionId
     WHERE vp.volunteerId = ?`, [volunteerId])
  return rows
}

async function catalogScopes (connection, positionIds) {
  if (!positionIds.length) return new Map()
  const [rows] = await connection.query(
    'SELECT CAST(id AS CHAR) AS id, scope FROM `position` WHERE id IN (?)', [positionIds])
  return new Map(rows.map(r => [r.id, r.scope]))
}

async function assertIdsExist (connection, table, label, ids) {
  if (!ids.length) return
  const [rows] = await connection.query(`SELECT CAST(id AS CHAR) AS id FROM ${table} WHERE id IN (?)`, [ids])
  const missing = ids.filter(id => !rows.some(r => r.id === id))
  if (missing.length) throw new SmError.UnprocessableError(`Unknown ${label}: ${missing.join(', ')}`)
}

// Every requested position is validated, not only additions: an ineligible
// held position can't exist (D8 invariant), so a request keeping one whose
// associate village is being removed is rejected.
async function applyPositions (connection, volunteerId, requested, eligibility) {
  if (findDuplicateKeys(requested, positionKey).length) {
    throw new SmError.UnprocessableError('The same position is listed twice for the same village or circle.')
  }
  const ids = [...new Set(requested.map(p => String(p.positionId)))]
  const scopes = await catalogScopes(connection, ids)
  const unknown = ids.filter(id => !scopes.has(id))
  if (unknown.length) throw new SmError.UnprocessableError(`Unknown positionId: ${unknown.join(', ')}`)
  await assertIdsExist(connection, 'village', 'villageId',
    [...new Set(requested.filter(p => p.villageId != null).map(p => String(p.villageId)))])
  await assertIdsExist(connection, 'circle', 'circleId',
    [...new Set(requested.filter(p => p.circleId != null).map(p => String(p.circleId)))])
  for (const p of requested) {
    const scope = scopes.get(String(p.positionId))
    const err = scopeShapeError(p, scope)
    if (err) throw new SmError.UnprocessableError(`positionId ${p.positionId}: ${err}`)
    if (!isEligible(p, scope, eligibility)) {
      throw new SmError.UnprocessableError(
        `positionId ${p.positionId}: villageId ${p.villageId} is neither the volunteer's home village nor one of their associate villages`)
    }
  }
  const { add, remove } = diffPositions(await loadPositions(connection, volunteerId), requested)
  if (remove.length) {
    await connection.query('DELETE FROM volunteer_position WHERE id IN (?)', [remove.map(r => r.id)])
  }
  if (add.length) {
    await connection.query(
      'INSERT INTO volunteer_position (volunteerId, positionId, villageId, circleId) VALUES ?',
      [add.map(p => [volunteerId, p.positionId, p.villageId ?? null, p.circleId ?? null])])
  }
}

// For the controller's per-scope authorization (spec §4.3 step 3): which
// assignments this request adds or removes, with each one's scope. Pool
// read outside the write transaction; the service re-validates inside it.
// An unknown positionId gets scope null, which the controller treats as
// needing a federation grant; the service then rejects it with 422.
async function positionChanges (personId, requested) {
  const [vol] = await dbUtils.pool.query('SELECT id FROM volunteer WHERE personId = ?', [personId])
  const current = vol.length ? await loadPositions(dbUtils.pool, vol[0].id) : []
  const { add, remove } = diffPositions(current, requested)
  const scopes = await catalogScopes(dbUtils.pool, [...new Set(add.map(p => String(p.positionId)))])
  return {
    added: add.map(p => ({ positionId: p.positionId, villageId: p.villageId ?? null, scope: scopes.get(String(p.positionId)) ?? null })),
    removed: remove.map(r => ({ positionId: r.positionId, villageId: r.villageId, scope: r.scope })),
  }
}

// D8 revocation: delete village-scoped positions whose village is neither
// the home village nor a remaining associate village. Runs on the caller's
// transaction, after the write that changed the association.
async function pruneIneligiblePositions (connection, volunteerId) {
  const [res] = await connection.query(
    `DELETE vp FROM volunteer_position vp
     JOIN \`position\` pos ON pos.id = vp.positionId AND pos.scope = 'village'
     JOIN volunteer v ON v.id = vp.volunteerId
     JOIN person p ON p.id = v.personId
     WHERE vp.volunteerId = ?
       AND NOT (vp.villageId <=> p.villageId)
       AND NOT EXISTS (
         SELECT 1 FROM volunteer_village_associate a
         WHERE a.volunteerId = vp.volunteerId AND a.villageId = vp.villageId)`,
    [volunteerId])
  return res.affectedRows
}

module.exports = {
  trainingKey, positionKey, findDuplicateKeys, diffTrainings, diffPositions, scopeShapeError, isEligible, applyTrainings,
  applyPositions, positionChanges, pruneIneligiblePositions,
}
