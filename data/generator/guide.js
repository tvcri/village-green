import { ROLE, ROLE_NAMES } from './constants.js'

const ROLE_DEMOS = {
  [ROLE.lsc]: 'village-scoped read access as a Local Service Coordinator',
  [ROLE.steering]: 'village governance read access (Steering Committee)',
  [ROLE.lead]: 'Village Lead — village reads incl. member financials',
  [ROLE.admin]: 'application admin — sees and can do everything (incl. elevate)',
  [ROLE.staff]: 'Hub staff — full operational read/write; creates service requests',
  [ROLE.board]: 'Board — federation-wide redacted visibility',
  [ROLE.serviceCoordinator]: 'federation-wide service request coordination',
}
const FEATURED = new Set(['admin', 'samuel.slater@millworks.test', 'samuel.gorton@hub.test',
  'elizabeth.chace@hub.test', 'moses.brown@board.test', 'mr.calimari@quahog.test',
  'roger.williams@providence.test', 'john.brown@brownbros.test'])

// One roster entry per login the droplist mockOidc should offer (spec §7).
export function buildLogins (ds) {
  const villageName = Object.fromEntries(ds.village.map(v => [v.id, v.name]))
  const grantsByUser = {}
  for (const g of ds.role_grant) (grantsByUser[g.userId] ??= []).push(g)
  const vssByUsername = new Set(ds.__meta.plants.vssLogins.map(v => v.username))
  const logins = ds.user_data.map(u => {
    const grants = grantsByUser[u.userId] || []
    const villages = [...new Set(grants.filter(g => g.villageId !== null).map(g => villageName[g.villageId]))]
    const roles = [...new Set(grants.map(g => ROLE_NAMES[g.roleId]))]
    let demos = grants.length ? [...new Set(grants.map(g => ROLE_DEMOS[g.roleId]))].join('; ')
      : 'valid login with no grants — sees nothing'
    if (vssByUsername.has(u.username)) demos = 'volunteer self-service (VSS) — sign up for open requests as this volunteer'
    return {
      username: u.username, name: JSON.parse(u.lastClaims).name ?? u.username,
      villages, role: roles.join(', '), demos,
      featured: FEATURED.has(u.username),
    }
  })
  // feature the first three VSS logins so the droplist default shows the flow
  let vssFeatured = 0
  for (const l of logins) if (vssByUsername.has(l.username) && vssFeatured < 3) { l.featured = true; vssFeatured++ }
  logins.push({
    username: ds.__meta.plants.ackModalUsername, name: 'Ezra Stiles (new arrival)',
    villages: [], role: '', featured: true,
    demos: 'never-seeded login — experiences the privacy-acknowledgement modal on first sign-in',
  })
  return logins
}

export function buildGuide (ds) {
  const p = ds.__meta.plants
  const villageName = Object.fromEntries(ds.village.map(v => [v.id, v.name]))
  const lines = []
  const section = (t) => lines.push('', `## ${t}`, '')
  lines.push('# Village Green demo dataset — guide', '',
    'Generated with the dataset (same seed ⇒ same names). Where to find each demo scenario.')

  section('Logins')
  lines.push('| Login | Role | Village(s) | Demos |', '|---|---|---|---|')
  for (const l of buildLogins(ds).filter(l => l.featured)) {
    lines.push(`| ${l.username} | ${l.role || '—'} | ${l.villages.join(', ') || '—'} | ${l.demos} |`)
  }
  lines.push('', `Full roster incl. VSS volunteer logins: see demo-logins.json (${ds.user_data.length} logins).`)

  section('Villages')
  const counts = (vid) => {
    const pids = new Set(ds.person.filter(x => x.villageId === vid).map(x => x.id))
    const m = ds.member.filter(x => pids.has(x.personId))
    const v = ds.volunteer.filter(x => pids.has(x.personId))
    return `${m.length} members (${m.filter(x => x.status !== 'Active').length} inactive), ` +
      `${v.length} volunteers (${v.filter(x => x.active === 0).length} inactive)`
  }
  for (const v of ds.village) lines.push(`- **${v.name}** — ${counts(v.id)}`)

  section('Planted scenarios')
  const w = (x) => `${x.name} (${x.village})`
  lines.push(
    `- **Dual household:** ${w(p.dualHousehold.primary)} + ${w(p.dualHousehold.secondary)}`,
    `- **Member who also volunteers:** ${w(p.memberAndVolunteer)}`,
    `- **Duplicate email** (${p.duplicateEmail.email}): ${p.duplicateEmail.persons.map(w).join(' and ')}`,
    `- **Inactive/Dropped members:** ${p.inactiveMembers.map(x => `${w(x)} [${x.status}]`).join(', ')}`,
    `- **Inactive volunteers:** ${p.inactiveVolunteers.map(w).join(', ')}`,
    `- **Confidential-notes member (staff-only visibility):** ${w(p.confidentialNotesMember)}`,
    p.flexibleRide ? `- **"No specific times" ride:** request #${p.flexibleRide.id} for ${w(p.flexibleRide.member)}` : null,
    p.outHomeRide ? `- **Ride home from a venue:** request #${p.outHomeRide.id} for ${w(p.outHomeRide.member)}` : null,
    `- **Standing series:** ${w(p.standingSeries.member)} — ${p.standingSeries.serviceName} ×${p.standingSeries.count}`,
    `- **Privacy-ack modal:** sign in as ${p.ackModalUsername}`,
  )
  lines.push('', '### Community participants')
  const personById = Object.fromEntries(ds.person.map(x => [x.id, x]))
  for (const c of ds.community) {
    const names = ds.person_community.filter(pc => pc.communityId === c.id)
      .map(pc => `${personById[pc.personId].firstName} ${personById[pc.personId].lastName} (${villageName[personById[pc.personId].villageId]})`)
    lines.push(`- **${c.name}** (${names.length}): ${names.slice(0, 12).join(', ')}${names.length > 12 ? ', …' : ''}`)
  }

  section('Gag requests')
  for (const g of ds.__meta.gagIndex) {
    const sr = ds.service_request.find(x => x.id === g.srId)
    lines.push(`- **${g.figure}** (${villageName[sr.villageId]}) — request #${sr.id}: ${sr.serviceName}`)
  }

  return lines.filter(l => l !== null).join('\n') + '\n'
}
