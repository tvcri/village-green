// What a volunteer-editor Save will do, for the footer summary (the same idea
// as PositionDetail's "2 to add, 1 to remove"). Compares the form as loaded
// with the form now. Vetting and training rows carry a `key` set at load (or
// when added) that identifies them across edits; positions are identified by
// what they are. Pass the positions that will actually be sent, so a row
// marked "Will be removed on save" counts as removed.

const str = (v) => (v === null || v === undefined ? '' : String(v))
const idSet = (ids = []) => ids.map(str).sort().join(',')

export function volunteerSnapshot ({ active, notes, capabilityIds, associateVillageIds, vettings, trainings, positions }) {
  return {
    active: !!active,
    notes: str(notes),
    capabilities: idSet(capabilityIds),
    associateVillages: idSet(associateVillageIds),
    vettings: new Map(vettings.map(v => [v.key, [v.vettingTypeId, v.dateEntered, v.dateExpired].map(str).join('|')])),
    trainings: new Map(trainings.map(t => [t.key, [t.trainingId, t.completedDate, t.notes].map(str).join('|')])),
    positions: new Set(positions.map(p => [p.positionId, p.villageId, p.circleId].map(str).join('|'))),
  }
}

function rowCounts (before, after) {
  let added = 0
  let removed = 0
  let changed = 0
  for (const [key, value] of after) {
    if (!before.has(key)) added++
    else if (before.get(key) !== value) changed++
  }
  for (const key of before.keys()) if (!after.has(key)) removed++
  return { added, removed, changed }
}

function phrases (noun, { added = 0, removed = 0, changed = 0 }) {
  const n = (count) => `${count} ${noun}${count === 1 ? '' : 's'}`
  return [added && `${n(added)} added`, removed && `${n(removed)} removed`, changed && `${n(changed)} changed`].filter(Boolean)
}

const FIELDS = [['active', 'active'], ['capabilities', 'capabilities'], ['associateVillages', 'associate villages'], ['notes', 'notes']]

// Returns the summary parts in form order; empty when nothing changed.
export function summarizeVolunteerChanges (before, after) {
  const positionsAdded = [...after.positions].filter(p => !before.positions.has(p)).length
  const positionsRemoved = [...before.positions].filter(p => !after.positions.has(p)).length
  const edited = FIELDS.filter(([k]) => before[k] !== after[k]).map(([, label]) => label)
  return [
    ...phrases('vetting', rowCounts(before.vettings, after.vettings)),
    ...phrases('training', rowCounts(before.trainings, after.trainings)),
    ...phrases('position', { added: positionsAdded, removed: positionsRemoved }),
    ...(edited.length ? [`${edited.join(', ')} edited`] : []),
  ]
}
