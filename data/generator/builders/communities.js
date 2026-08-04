// Community tags (spec §3). The catalog mirrors migration 0010 exactly; the
// generator truncates + re-seeds it like the other demo catalogs.
export function buildCommunities (plan, membership, rng, villagesList, villageIdByName) {
  const community = [{ id: 1, name: 'Pride' }, { id: 2, name: 'Veteran' }]
  const person_community = []
  const tagged = new Set()
  let id = 0
  const tag = (personId, communityId) => {
    const key = `${personId}:${communityId}`
    if (tagged.has(key)) return
    tagged.add(key)
    id += 1
    person_community.push({ id, personId, communityId })
  }
  // ~12% of persons carry one community tag
  for (const p of plan.person) if (rng.bool(0.12)) tag(p.id, rng.pick(community).id)
  // guarantee: each community has >=1 active member and >=1 active volunteer
  // in each selected big village, so there is always something to show
  const activeMembers = new Set(membership.member.filter(m => m.status === 'Active').map(m => m.personId))
  const activeVols = new Set(membership.volunteer.filter(v => v.active === 1).map(v => v.personId))
  for (const v of villagesList.filter(v => v.size === 'big')) {
    const { members, volunteers } = plan.byVillage[villageIdByName[v.name]]
    for (const c of community) {
      const hasTag = (pool, activeSet) => pool.some(pid => activeSet.has(pid) && tagged.has(`${pid}:${c.id}`))
      if (!hasTag(members, activeMembers)) {
        const pick = members.filter(pid => activeMembers.has(pid))
        if (pick.length) tag(rng.pick(pick), c.id)
      }
      if (!hasTag(volunteers, activeVols)) {
        const pick = volunteers.filter(pid => activeVols.has(pid))
        if (pick.length) tag(rng.pick(pick), c.id)
      }
    }
  }
  return { community, person_community }
}
