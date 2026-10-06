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

export function candidateStatus (volunteer, group, position, holders, adds) {
  const inGroup = (personId, villageId, circleId) =>
    (villageId ?? null) === (group.villageId ?? null) && (circleId ?? null) === (group.circleId ?? null) && personId === volunteer.personId
  if (holders.some(h => inGroup(h.person.personId, h.village?.villageId, h.circle?.circleId)) ||
      adds.some(a => inGroup(a.personId, a.villageId, a.circleId))) {
    return { disabled: true, reason: 'Already holds it' }
  }
  const associates = (volunteer.associateVillages ?? []).map(v => v.villageId)
  if (!isPositionEligible({ scope: position.scope, villageId: group.villageId }, volunteer.village?.villageId, associates)) {
    const where = volunteer.village ? `Home village is ${volunteer.village.name}` : 'Hub volunteer, no home village'
    return { disabled: true, reason: `${where}. To add them in ${group.label}, add it as an associate village in their volunteer form.` }
  }
  return { disabled: false, reason: null }
}

export function buildHoldersPatch (adds, removeIds) {
  return {
    add: adds.map(a => ({ personId: a.personId, villageId: a.villageId ?? null, circleId: a.circleId ?? null })),
    remove: [...removeIds],
  }
}
