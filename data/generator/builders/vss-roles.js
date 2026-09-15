import { ROLE } from '../constants.js'

// Village-role logins (FILL_LOGINS/LEADS in villages.js) are synthetic accounts
// on themed domains, never tied to a person row; VSS logins are real volunteers'
// person.email. The two address spaces are disjoint, so no login ever held both
// a village role and VSS access — a dual-role person (volunteer who also sits on
// a village's Steering Committee) is common in the real roster and needs to be
// demo-able. Grant a village role to VSS volunteers who have actual workload.
export function grantVillageRolesToVssVolunteers (plan, membership, vss, role_grant, service_request, rng, baseDate) {
  const base = baseDate.toISOString().slice(0, 10)
  const personById = Object.fromEntries(plan.person.map(p => [p.id, p]))
  const srByVolunteer = {}
  for (const sr of service_request) {
    if (sr.volunteerPersonId) (srByVolunteer[sr.volunteerPersonId] ??= []).push(sr)
  }
  // Only volunteers with both halves of the flow are worth featuring.
  const candidates = Object.entries(vss.userIdByPersonId)
    .map(([personId, userId]) => {
      const pid = Number(personId)
      const srs = srByVolunteer[pid] || []
      return {
        personId: pid, userId, villageId: personById[pid]?.villageId ?? null,
        upcoming: srs.filter(s => s.serviceDate >= base && s.status === 'Confirmed').length,
        completed: srs.filter(s => s.serviceDate < base && s.status === 'Completed').length,
      }
    })
    .filter(c => c.villageId !== null && c.upcoming > 0 && c.completed > 0)
    .sort((a, b) => (b.upcoming + b.completed) - (a.upcoming + a.completed))

  // One Steering Committee member and one Local Service Coordinator, in
  // different villages so the village-scoping story stays legible.
  const granted = []
  const usedVillages = new Set()
  for (const roleId of [ROLE.steering, ROLE.lsc]) {
    const pick = candidates.find(c => !usedVillages.has(c.villageId) &&
      !granted.some(g => g.personId === c.personId))
    if (!pick) continue
    usedVillages.add(pick.villageId)
    role_grant.push({ userId: pick.userId, roleId, villageId: pick.villageId })
    granted.push({ ...pick, roleId })
  }
  return granted
}
