// Pure position rules shared by the volunteer editor, Edit Person and the
// position page (UI spec §8). IDs are compared as strings.
export const SCOPE_LABELS = { federation: 'Hub', village: 'Village', circle: 'Circle' }
export const scopeLabel = (scope) => SCOPE_LABELS[scope] ?? scope

const str = (v) => (v === null || v === undefined ? '' : String(v))

export function eligibleVillageIds (homeVillageId, associateVillageIds = []) {
  return [...new Set([homeVillageId, ...associateVillageIds].map(str).filter(Boolean))]
}

// D8: a village position must be in the home village or an associate village.
export function isPositionEligible ({ scope, villageId }, homeVillageId, associateVillageIds) {
  if (scope !== 'village') return true
  return eligibleVillageIds(homeVillageId, associateVillageIds).includes(str(villageId))
}

export function missingExpectedTrainings (expectedTrainingIds = [], trainings = []) {
  const have = new Set(trainings.map(t => str(t.trainingId)))
  return expectedTrainingIds.map(str).filter(id => !have.has(id))
}

// positions: volunteer-projection rows ({ scope, village: {villageId, name} | null, ... }).
export function positionsLostOnVillageChange ({ positions = [], associateVillageIds = [], newHomeVillageId }) {
  const keep = eligibleVillageIds(newHomeVillageId, associateVillageIds)
  return positions.filter(p => p.scope === 'village' && !keep.includes(str(p.village?.villageId)))
}

export function positionPlace (p) {
  return p.village?.name ?? p.circle?.name ?? 'Hub'
}
