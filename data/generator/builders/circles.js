// Circles (migration 0027, formerly communities). The catalog mirrors the
// static seed in 20-vg-static.sql exactly; the generator truncates + re-seeds
// it like the other demo catalogs.
//
// 0027 left production's Circle of Pride member-only (a member who is also a
// volunteer keeps it), so demo tags follow the same rule. DownCity and OakHill
// exist in the catalog but carry no demo members.
export const CIRCLE = { pride: 1, veterans: 2 }

export function buildCircles (plan, membership, rng, villagesList, villageIdByName) {
  const circle = [
    { id: 1, name: 'Circle of Pride' }, { id: 2, name: "Veteran's Circle" },
    { id: 3, name: 'DownCity' }, { id: 4, name: 'OakHill' },
  ]
  const memberPersonIds = new Set(membership.member.map(m => m.personId))
  const person_circle = []
  const tagged = new Set()
  let id = 0
  const tag = (personId, circleId) => {
    const key = `${personId}:${circleId}`
    if (tagged.has(key)) return
    tagged.add(key)
    id += 1
    person_circle.push({ id, personId, circleId })
  }
  // ~12% of persons carry one circle tag; a draw of Pride on a non-member
  // becomes the Veteran's Circle instead
  for (const p of plan.person) {
    if (!rng.bool(0.12)) continue
    const c = rng.pick([CIRCLE.pride, CIRCLE.veterans])
    tag(p.id, c === CIRCLE.pride && !memberPersonIds.has(p.id) ? CIRCLE.veterans : c)
  }
  // guarantee, per big village: an active member in each circle and an active
  // volunteer in the Veteran's Circle, so there is always something to show
  const activeMembers = new Set(membership.member.filter(m => m.status === 'Active').map(m => m.personId))
  const activeVols = new Set(membership.volunteer.filter(v => v.active === 1).map(v => v.personId))
  const ensure = (pool, activeSet, circleId) => {
    if (pool.some(pid => activeSet.has(pid) && tagged.has(`${pid}:${circleId}`))) return
    const pick = pool.filter(pid => activeSet.has(pid))
    if (pick.length) tag(rng.pick(pick), circleId)
  }
  for (const v of villagesList.filter(v => v.size === 'big')) {
    const { members, volunteers } = plan.byVillage[villageIdByName[v.name]]
    ensure(members, activeMembers, CIRCLE.pride)
    ensure(members, activeMembers, CIRCLE.veterans)
    ensure(volunteers, activeVols, CIRCLE.veterans)
  }

  // "Prefers a Volunteer From": about half the Circle of Pride's members
  const memberIdByPerson = Object.fromEntries(membership.member.map(m => [m.personId, m.id]))
  const member_circle_preference = []
  for (const pc of person_circle) {
    if (pc.circleId !== CIRCLE.pride || !rng.bool(0.5)) continue
    member_circle_preference.push({ id: member_circle_preference.length + 1, memberId: memberIdByPerson[pc.personId], circleId: CIRCLE.pride })
  }
  return { circle, person_circle, member_circle_preference }
}
