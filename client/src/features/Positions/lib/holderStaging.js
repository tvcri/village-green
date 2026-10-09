// Grouping and staging rules for a position's page (UI spec §5). Pure.
import { isPositionEligible } from '../../../shared/lib/positionRules.js'

const nonEmptyFirst = (a, b) =>
  (Number(b.rows.length + b.adds.length > 0) - Number(a.rows.length + a.adds.length > 0)) || a.label.localeCompare(b.label)

export function holderGroups ({ position, holders, villages, circles, adds }) {
  if (position.scope === 'village') {
    return villages.map(v => ({
      key: v.villageId, label: v.name, villageId: v.villageId, circleId: null,
      rows: holders.filter(h => h.village?.villageId === v.villageId),
      adds: adds.filter(a => a.villageId === v.villageId),
    })).sort(nonEmptyFirst)
  }
  if (position.scope === 'circle') {
    return circles.map(c => ({
      key: `c${c.circleId}`, label: c.name, villageId: null, circleId: c.circleId,
      rows: holders.filter(h => h.circle?.circleId === c.circleId),
      adds: adds.filter(a => a.circleId === c.circleId),
    })).sort(nonEmptyFirst)
  }
  return [{ key: 'hub', label: 'Holders', villageId: null, circleId: null, rows: holders, adds }]
}

// Who the add search offers in a group: active volunteers who could hold the
// position there (village positions: own or associate village). Everyone else
// is left out rather than listed greyed (agreed with staff 2026-10-08).
export function isPositionCandidate (volunteer, group, position) {
  if (!volunteer.active) return false
  const associates = (volunteer.associateVillages ?? []).map(v => v.villageId)
  return isPositionEligible({ scope: position.scope, villageId: group.villageId }, volunteer.village?.villageId, associates)
}

// The one-line explanation under the add search, since left-out people can't
// say why they are missing.
export function candidateNote (group) {
  return group.villageId
    ? `Lists active volunteers whose village or associate village is ${group.label}.`
    : 'Lists active volunteers.'
}

// A candidate who already holds the position in this group (or is staged to)
// stays listed, greyed, so searching for them doesn't come up empty.
export function candidateStatus (volunteer, group, holders, adds) {
  const inGroup = (personId, villageId, circleId) =>
    (villageId ?? null) === (group.villageId ?? null) && (circleId ?? null) === (group.circleId ?? null) && personId === volunteer.personId
  if (holders.some(h => inGroup(h.person.personId, h.village?.villageId, h.circle?.circleId)) ||
      adds.some(a => inGroup(a.personId, a.villageId, a.circleId))) {
    return { disabled: true, reason: 'Already holds it' }
  }
  return { disabled: false, reason: null }
}

export function buildHoldersPatch (adds, removeIds) {
  return {
    add: adds.map(a => ({ personId: a.personId, villageId: a.villageId ?? null, circleId: a.circleId ?? null })),
    remove: [...removeIds],
  }
}
