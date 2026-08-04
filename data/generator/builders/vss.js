// Volunteer user accounts for VSS demos (spec §4). modifiedUserId on a service
// request is the VSS marker — it must reference one of these ids, never staff.
// VSS identity matches ACTIVE volunteers only.
export function buildVssUsers (plan, membership, user_data, rng) {
  const personById = Object.fromEntries(plan.person.map(p => [p.id, p]))
  const active = membership.volunteer.filter(v => v.active === 1)
  const picked = rng.shuffle(active).slice(0, Math.max(1, Math.round(active.length * 0.25)))
  let nextId = user_data.reduce((m, u) => Math.max(m, u.userId), 0) + 1
  const userIdByPersonId = {}
  for (const v of picked) {
    const p = personById[v.personId]
    user_data.push({
      userId: nextId, username: p.email,
      lastClaims: JSON.stringify({ preferred_username: p.email, name: `${p.firstName} ${p.lastName}` }),
    })
    userIdByPersonId[v.personId] = nextId
    nextId += 1
  }
  return { userIdByPersonId }
}
