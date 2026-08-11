// Planted scenarios (spec §6): after the builders run, guarantee each demo
// scenario exists (mutating minimally where probability left a gap) and record
// exactly where it lives, for demo-guide.md. Deterministic given rng.
export function applyPlants (ds, rng) {
  const personById = Object.fromEntries(ds.person.map(p => [p.id, p]))
  const villageName = Object.fromEntries(ds.village.map(v => [v.id, v.name]))
  const who = (pid) => {
    const p = personById[pid]
    return { name: `${p.firstName} ${p.lastName}`, village: villageName[p.villageId] }
  }
  const plants = {}

  // duplicate email — deliberately planted; generated emails are unique by construction
  const [a, b] = [ds.person[0], ds.person.find(p => p.villageId !== ds.person[0].villageId) || ds.person[1]]
  b.email = a.email
  plants.duplicateEmail = { email: a.email, persons: [who(a.id), who(b.id)] }

  // dual household — probabilistic (~80%/village); force one if absent
  let hh = ds.member.find(m => m.primaryPersonId !== null)
  if (!hh) {
    const byVid = {}
    for (const m of ds.member) (byVid[personById[m.personId].villageId] ??= []).push(m)
    const pool = Object.values(byVid).find(list => list.length >= 2)
    const [primary, secondary] = pool
    secondary.primaryPersonId = primary.personId
    secondary.secondaryType = 'Spouse'
    secondary.householdSize = 2; primary.householdSize = 2
    hh = secondary
  }
  plants.dualHousehold = { village: who(hh.personId).village, primary: who(hh.primaryPersonId), secondary: who(hh.personId) }

  // member + volunteer overlap — force one if the ~6% reuse produced none.
  // buildRequests/buildVssUsers already ran, so service_request.volunteerPersonId
  // and user_data both reference volunteers by their ORIGINAL personId — reassigning
  // one out from under those references would leave them dangling/mismatched.
  const memberIds = new Set(ds.member.map(m => m.personId))
  let both = ds.volunteer.find(v => memberIds.has(v.personId))
  if (!both) {
    const personEmailsForVss = new Set(ds.user_data.map(u => u.username))
    const hasDependents = (v) =>
      ds.service_request.some(sr => sr.volunteerPersonId === v.personId) ||
      personEmailsForVss.has(personById[v.personId]?.email)
    const m = ds.member.find(x => x.status === 'Active')
    const dependentFree = ds.volunteer.find(x => !hasDependents(x))
    const v = dependentFree || ds.volunteer[0]
    const oldPersonId = v.personId
    v.personId = m.personId
    if (!dependentFree) {
      // guard fallback: every volunteer had dependents — sweep references forward
      // so the flipped volunteer's old service_request rows follow them
      for (const sr of ds.service_request) {
        if (sr.volunteerPersonId === oldPersonId) sr.volunteerPersonId = v.personId
      }
    }
    both = v
  }
  plants.memberAndVolunteer = who(both.personId)

  // >=1 inactive member and >=1 inactive volunteer (5% can round to 0 on tiny configs)
  if (!ds.member.some(m => m.status !== 'Active')) {
    const m = ds.member[ds.member.length - 1]
    m.status = 'Inactive'; m.dropReason = 'Moved away'
  }
  if (!ds.volunteer.some(v => v.active === 0)) {
    // VSS identity = active volunteers only — prefer flipping a volunteer with
    // no VSS account so a tiny config can't silently knock out a demoable VSS login
    const vssUsernames = new Set(ds.user_data.map(u => u.username))
    const noVssAccount = (v) => !vssUsernames.has(personById[v.personId]?.email)
    const target = ds.volunteer.filter(noVssAccount).at(-1) || ds.volunteer[ds.volunteer.length - 1]
    target.active = 0
  }
  plants.inactiveMembers = ds.member.filter(m => m.status !== 'Active').map(m => ({ ...who(m.personId), status: m.status }))
  plants.inactiveVolunteers = ds.volunteer.filter(v => v.active === 0).map(v => who(v.personId))

  // confidential-notes member (0.4 prob — force if absent)
  let conf = ds.member.find(m => m.confidentialNotes)
  if (!conf) { conf = ds.member[0]; conf.confidentialNotes = 'Family requests staff-only handling of contact changes.' }
  plants.confidentialNotesMember = who(conf.personId)

  // flexible ride + out->home ride — flip one existing ride if probability missed
  const rides = ds.service_request.filter(sr => sr.serviceName.startsWith('Ride:'))
  let flex = rides.find(sr => sr.timesFlexible === 1)
  if (!flex && rides.length) {
    flex = rides[0]
    flex.timesFlexible = 1
    flex.startTime = null; flex.finishTime = null; flex.apptTime = null; flex.returnTime = null
  }
  if (flex) plants.flexibleRide = { id: flex.id, member: who(flex.memberPersonId) }
  let outHome = rides.find(sr => sr.destination === 'Home')
  if (!outHome && rides.length > 1) {
    outHome = rides.find(sr => sr.start === 'Home') || rides[1]
    const home = personById[outHome.memberPersonId]
    outHome.start = outHome.destination || 'Clinic'
    outHome.startAddress = outHome.address; outHome.startCity = outHome.city
    outHome.startState = 'RI'; outHome.startZip = null; outHome.startPhone = null
    outHome.destination = 'Home'
    outHome.address = home.street; outHome.city = home.city; outHome.state = 'RI'
    outHome.zip = home.zip; outHome.phone = home.phone
    // the flipped ride is now a one-way trip home — the old round-trip appt/return
    // times were computed for the original venue trip and no longer apply
    outHome.transportationType = 'One Way'
    outHome.apptTime = null; outHome.returnTime = null
  }
  if (outHome) plants.outHomeRide = { id: outHome.id, member: who(outHome.memberPersonId) }

  // longest standing series (same member+service+booking timestamp, >1 occurrence)
  const seriesCount = {}
  for (const sr of ds.service_request) {
    const k = `${sr.memberPersonId}|${sr.serviceName}|${sr.createdAt}`
    seriesCount[k] = (seriesCount[k] || 0) + 1
  }
  const [bestKey, count] = Object.entries(seriesCount).sort((x, y) => y[1] - x[1])[0]
  const [pid, serviceName] = bestKey.split('|')
  plants.standingSeries = { member: who(Number(pid)), serviceName, count }

  // never-seeded login that hits the privacy-ack modal on first sign-in
  plants.ackModalUsername = 'ezra.stiles@newcomer.test'

  // VSS logins (volunteer user accounts — username = person email)
  const personEmails = new Set(ds.person.map(p => p.email))
  plants.vssLogins = ds.user_data
    .filter(u => personEmails.has(u.username))
    .map(u => ({ username: u.username, name: JSON.parse(u.lastClaims).name }))

  return plants
}
