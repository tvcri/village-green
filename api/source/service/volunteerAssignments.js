'use strict'
// Volunteer training and position assignments (trainings/positions spec §4.2–4.3).
// The volunteer PUT/PATCH carries full arrays, but they are APPLIED AS A DIFF
// so unchanged rows keep their ids — future per-item endpoints stay additive.
// Pure helpers first; the DB functions below them run on the caller's
// transaction connection.

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
function isEligible (p, scope, { homeVillageId, associateVillageIds }) {
  if (scope !== 'village') return true
  const v = s(p.villageId)
  return v === s(homeVillageId) || associateVillageIds.map(s).includes(v)
}

module.exports = {
  trainingKey, positionKey, findDuplicateKeys, diffTrainings, diffPositions, scopeShapeError, isEligible,
}
