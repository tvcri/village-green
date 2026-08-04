import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { makeRng } from '../generator/rng.js'
import { VILLAGES, ROLE, SERVICE_CATEGORIES, NO_LOCATION_SERVICES } from '../generator/constants.js'
import { resolveVillages } from '../generator/sizing.js'
import { buildVillagesAndUsers } from '../generator/builders/villages.js'
import { buildPersons } from '../generator/builders/persons.js'
import { buildMembership } from '../generator/builders/membership.js'
import { buildDataset } from '../generator/data.js'

const content = {
  people: JSON.parse(readFileSync(fileURLToPath(new URL('../content/people.json', import.meta.url)), 'utf8')),
}

const services = JSON.parse(readFileSync(fileURLToPath(new URL('../content/services.json', import.meta.url)), 'utf8'))
const fullContent = { people: content.people, services }

function fullContentWithDest () {
  const destinations = JSON.parse(readFileSync(fileURLToPath(new URL('../content/destinations.json', import.meta.url)), 'utf8'))
  return { people: content.people, services, destinations }
}

test('villages: 10 villages with 1-based ids', () => {
  const { village, villageIdByName } = buildVillagesAndUsers(content, makeRng(1), resolveVillages({}))
  assert.equal(village.length, 10)
  assert.equal(village[0].id, 1)
  assert.equal(villageIdByName[VILLAGES[0].name], 1)
})

test('persons: no generated-column keys, unique (village,name), themed big villages', () => {
  const villagesList = resolveVillages({})
  const { village, villageIdByName } = buildVillagesAndUsers(fullContent, makeRng(1), villagesList)
  const { person, byVillage, nameById } = buildPersons(fullContent, villageIdByName, makeRng(1), villagesList)
  for (const p of person) {
    // address and fullName are DB-generated — builders must never set them
    assert.ok(!('address' in p), 'person rows must not set the generated address column')
    assert.ok(!('fullName' in p), 'person rows must not set the generated fullName column')
    assert.equal(typeof nameById[p.id], 'string')
    assert.ok(p.firstName, 'firstName feeds the generated fullName')
    assert.ok(p.villageId >= 1 && p.villageId <= 10)
    // quirky figure names that don't survive the first/last split live in nickname
    if (nameById[p.id] !== `${p.firstName} ${p.lastName}`.trim()) assert.equal(p.nickname, nameById[p.id])
  }
  // a figure never appears in two villages: unique (villageId, original name)
  const keys = person.map(p => `${p.villageId}::${nameById[p.id].toLowerCase()}`)
  assert.equal(keys.length, new Set(keys).size)
  // demographic sprinkle: ~half carry a middle initial, ~10% a salutation
  const miShare = person.filter(p => p.middleInitial).length / person.length
  assert.ok(miShare > 0.4 && miShare < 0.6, `middleInitial share ${miShare.toFixed(2)} not ~0.5`)
  const salShare = person.filter(p => p.salutation).length / person.length
  assert.ok(salShare > 0.04 && salShare < 0.18, `salutation share ${salShare.toFixed(2)} not ~0.1`)
})

test('persons: village targets honor the resolved mix', () => {
  const villagesList = resolveVillages({})
  const { villageIdByName } = buildVillagesAndUsers(fullContent, makeRng(1), villagesList)
  const { byVillage } = buildPersons(fullContent, villageIdByName, makeRng(1), villagesList)
  const arkham = byVillage[villageIdByName['Arkham']]   // 45/68 volunteer-heavy
  assert.ok(arkham.volunteers.length > arkham.members.length, 'Arkham should be volunteer-heavy')
  assert.ok(Math.abs(arkham.members.length - 45) <= 2)
  const quahog = byVillage[villageIdByName['Quahog']]   // 68/45 member-heavy
  assert.ok(quahog.members.length > quahog.volunteers.length, 'Quahog should be member-heavy')
})

test('persons: trimmed uniform config', () => {
  const villagesList = resolveVillages({ villages: '3', members: 15, volunteers: 20 })
  const { villageIdByName } = buildVillagesAndUsers(fullContent, makeRng(1), villagesList)
  const { byVillage } = buildPersons(fullContent, villageIdByName, makeRng(1), villagesList)
  for (const vid of Object.keys(byVillage)) {
    assert.ok(Math.abs(byVillage[vid].members.length - 15) <= 1)
    assert.ok(Math.abs(byVillage[vid].volunteers.length - 20) <= 2) // ~6% member-reuse variance
  }
})

test('membership: status/active invariants and <=10% member/volunteer overlap', () => {
  const villagesList = resolveVillages({})
  const { villageIdByName } = buildVillagesAndUsers(fullContent, makeRng(1), villagesList)
  const { person, byVillage } = buildPersons(fullContent, villageIdByName, makeRng(1), villagesList)
  const m = buildMembership({ person, byVillage }, fullContent, makeRng(1))
  const personIds = new Set(person.map(p => p.id))

  for (const row of m.member) {
    assert.ok(personIds.has(row.personId))
    assert.equal(typeof row.status, 'string')
    if (row.status !== 'Active') assert.ok(row.dropReason, 'inactive members need a dropReason')
  }
  assert.ok(m.member.some(r => r.status === 'Active'))
  assert.ok(m.member.some(r => r.status !== 'Active'))

  for (const row of m.volunteer) {
    assert.ok(personIds.has(row.personId))
    assert.ok(row.active === 0 || row.active === 1)
  }
  assert.ok(m.volunteer.some(r => r.active === 1) && m.volunteer.some(r => r.active === 0))

  // overlap: persons who are BOTH member and volunteer <= 10% of volunteers
  // (members receive services; volunteers provide them — mostly distinct populations)
  const memberPersons = new Set(m.member.map(r => r.personId))
  const both = m.volunteer.filter(r => memberPersons.has(r.personId)).length
  assert.ok(both <= Math.ceil(m.volunteer.length * 0.10), `overlap ${both}/${m.volunteer.length}`)

  // ~5% inactivity on both sides, drawn from the invented filler persons first
  const inactiveMembers = m.member.filter(r => r.status !== 'Active')
  const inactiveShare = inactiveMembers.length / m.member.length
  assert.ok(inactiveShare > 0.02 && inactiveShare < 0.08, `inactive member share ${inactiveShare.toFixed(2)} not ~0.05`)
  const inactiveVolShare = m.volunteer.filter(r => r.active === 0).length / m.volunteer.length
  assert.ok(inactiveVolShare > 0.02 && inactiveVolShare < 0.08, `inactive volunteer share ${inactiveVolShare.toFixed(2)} not ~0.05`)

  // dataset-wide mix is now volunteer-heavy overall (most villages default to
  // 40/60 members:volunteers; only the memberHeavy villages flip to 60/40)
  const memberShare = m.member.length / (m.member.length + m.volunteer.length)
  assert.ok(memberShare > 0.40 && memberShare < 0.55, `member share ${memberShare.toFixed(2)} not ~0.45-0.50`)
  // ~66% of members carry a standing service note (echoed into request instructions)
  const noteShare = m.member.filter(r => r.serviceNotes).length / m.member.length
  assert.ok(noteShare > 0.55 && noteShare < 0.78, `serviceNotes share ${noteShare.toFixed(2)} not ~0.66`)
  // ~40% carry a staff-only confidential note
  const confShare = m.member.filter(r => r.confidentialNotes).length / m.member.length
  assert.ok(confShare > 0.28 && confShare < 0.52, `confidentialNotes share ${confShare.toFixed(2)} not ~0.4`)
  // every member has dues, $0–60 with $40 the common tier
  assert.ok(m.member.every(r => typeof r.householdDues === 'number' && r.householdDues >= 0 && r.householdDues <= 60))
  const at40 = m.member.filter(r => r.householdDues === 40).length / m.member.length
  assert.ok(at40 > 0.4, `only ${(at40 * 100).toFixed(0)}% of members at the $40 tier`)
  // ~half of volunteers carry a staff note; disability links too (few rows, so just both-kinds)
  const volNoteShare = m.volunteer.filter(r => r.notes).length / m.volunteer.length
  assert.ok(volNoteShare > 0.35 && volNoteShare < 0.65, `volunteer notes share ${volNoteShare.toFixed(2)} not ~0.5`)
  assert.ok(m.person_disability.some(r => r.note) && m.person_disability.some(r => !r.note))

  // junctions reference valid parents
  const volIds = new Set(m.volunteer.map(v => v.id))
  for (const vc of m.volunteer_capability) assert.ok(volIds.has(vc.volunteerId))
  for (const vv of m.volunteer_vetting) assert.ok(volIds.has(vv.volunteerId))
  const disIds = new Set(m.disability.map(d => d.id))
  for (const pd of m.person_disability) assert.ok(disIds.has(pd.disabilityId) && personIds.has(pd.personId))
})

test('membership: vettings never expired', () => {
  const villagesList = resolveVillages({})
  const { villageIdByName } = buildVillagesAndUsers(fullContent, makeRng(1), villagesList)
  const plan = buildPersons(fullContent, villageIdByName, makeRng(1), villagesList)
  const { volunteer_vetting } = buildMembership(plan, fullContent, makeRng(1))
  assert.ok(volunteer_vetting.length > 0)
  for (const vv of volunteer_vetting) assert.ok(vv.dateExpired > '2026-06-30', `expired vetting ${vv.dateExpired}`)
})

test('grants: role catalog coverage and federation personas', () => {
  const villagesList = resolveVillages({})
  const { village, user_data, role_grant } = buildVillagesAndUsers(fullContent, makeRng(1), villagesList)
  assert.equal(village.length, 10)
  const byUser = Object.fromEntries(user_data.map(u => [u.username, u.userId]))
  // federation personas: Admin x2, Staff, Service Coordinator, Board
  const fedGrants = role_grant.filter(g => g.villageId === null)
  const roleOf = (username) => fedGrants.filter(g => g.userId === byUser[username]).map(g => g.roleId)
  assert.deepEqual(roleOf('admin'), [ROLE.admin])
  assert.deepEqual(roleOf('samuel.slater@millworks.test'), [ROLE.admin])
  assert.deepEqual(roleOf('samuel.gorton@hub.test'), [ROLE.staff])
  assert.deepEqual(roleOf('elizabeth.chace@hub.test'), [ROLE.serviceCoordinator])
  assert.deepEqual(roleOf('moses.brown@board.test'), [ROLE.board])
  // zero-grants user exists with no grants at all
  assert.equal(role_grant.filter(g => g.userId === byUser['mr.calimari@quahog.test']).length, 0)
  // every village fields all three village roles among its own users
  for (const v of village) {
    for (const roleId of [ROLE.lead, ROLE.steering, ROLE.lsc]) {
      assert.ok(role_grant.some(g => g.villageId === v.id && g.roleId === roleId),
        `village ${v.name} missing roleId ${roleId}`)
    }
  }
  // meta roll-up persona holds Village Lead in 3 villages
  assert.equal(role_grant.filter(g => g.userId === byUser['john.brown@brownbros.test']).length, 3)
  // grantId omitted (auto-increment)
  assert.ok(role_grant.every(g => !('grantId' in g)))
})

test('grants: unselected-village personas are skipped, not crashed', () => {
  const villagesList = resolveVillages({ villages: 'Quahog, Cabinet' })
  const { village, role_grant } = buildVillagesAndUsers(fullContent, makeRng(1), villagesList)
  assert.equal(village.length, 2)
  const villageIds = new Set(village.map(v => v.id))
  assert.ok(role_grant.every(g => g.villageId === null || villageIds.has(g.villageId)))
})

test('requests are attributed to the federation creator pool; every user carries a name claim', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  const creatorIds = new Set(ds.role_grant
    .filter(g => g.roleId === ROLE.staff || g.roleId === ROLE.serviceCoordinator)
    .map(g => g.userId))
  for (const sr of ds.service_request) {
    assert.ok(sr.createdUserId, `request ${sr.id} has no creating user`)
    assert.ok(creatorIds.has(sr.createdUserId),
      `request ${sr.id} creator ${sr.createdUserId} is not Staff/Service Coordinator`)
  }
  // every user carries a display-name claim for creator attribution
  for (const u of ds.user_data) {
    const claims = JSON.parse(u.lastClaims)
    assert.ok(claims.name, `user ${u.username} needs a name claim`)
  }
})

test('service requests honor deriveStatus and reference valid people', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  const personIds = new Set(ds.person.map(p => p.id))
  const villageIds = new Set(ds.village.map(v => v.id))
  const statuses = new Set(['Open', 'Confirmed', 'Completed', 'Member cancelled', 'Volunteer cancelled', 'Hub cancelled'])
  for (const sr of ds.service_request) {
    assert.ok(villageIds.has(sr.villageId))
    assert.ok(statuses.has(sr.status), `bad status ${sr.status}`)
    if (sr.status === 'Confirmed' || sr.status === 'Completed') assert.ok(sr.volunteerPersonId, `${sr.status} needs a volunteer`)
    if (sr.status === 'Open') assert.equal(sr.volunteerPersonId, null)
    if (sr.memberPersonId) assert.ok(personIds.has(sr.memberPersonId))
    if (sr.volunteerPersonId) assert.ok(personIds.has(sr.volunteerPersonId))
  }
  // a spread of statuses is present
  const seen = new Set(ds.service_request.map(s => s.status))
  for (const s of ['Open', 'Confirmed', 'Completed']) assert.ok(seen.has(s), `missing status ${s}`)
})

test('service requests match the UI-enforced category/transport/location rules', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  const noteByPerson = Object.fromEntries(ds.member.filter(m => m.serviceNotes).map(m => [m.personId, m.serviceNotes]))
  for (const sr of ds.service_request) {
    assert.ok(SERVICE_CATEGORIES.includes(sr.serviceName), `bad category ${sr.serviceName}`)
    const isRide = sr.serviceName.startsWith('Ride:')
    if (isRide) {
      assert.ok(['Round Trip', 'One Way'].includes(sr.transportationType), `ride needs RT/OW, got ${sr.transportationType}`)
      assert.ok(sr.destination, 'rides require a destination')
    } else {
      assert.equal(sr.transportationType, 'None')
    }
    if (NO_LOCATION_SERVICES.includes(sr.serviceName)) {
      for (const f of ['destination', 'address', 'city', 'state', 'zip', 'phone']) {
        assert.equal(sr[f], null, `${sr.serviceName} must not set ${f}`)
      }
    } else {
      // grid shows Destination + City columns — both must render
      assert.ok(sr.destination, 'location services need a destination')
      assert.ok(sr.city, 'location services need a city')
      assert.ok(sr.address, 'location services need an address')
    }
    // UI time flow: RT = Start -> Arrival -> Return -> Finish; otherwise no appt/return.
    // Flexible requests (incl. all non-Rides) carry no times at all.
    if (sr.timesFlexible) {
      assert.equal(sr.startTime, null); assert.equal(sr.finishTime, null)
      assert.equal(sr.apptTime, null); assert.equal(sr.returnTime, null)
    } else {
      assert.ok(sr.startTime <= sr.finishTime)
      if (sr.transportationType === 'Round Trip') {
        assert.ok(sr.apptTime && sr.returnTime, 'round trips seed arrival + return')
        assert.ok(sr.startTime < sr.apptTime && sr.apptTime < sr.returnTime && sr.returnTime < sr.finishTime,
          `RT time order: ${sr.startTime} ${sr.apptTime} ${sr.returnTime} ${sr.finishTime}`)
      } else {
        assert.equal(sr.apptTime, null)
        assert.equal(sr.returnTime, null)
      }
    }
    // instructions echo the member's standing service note (or are absent)
    if (sr.instructions) assert.equal(sr.instructions, noteByPerson[sr.memberPersonId])
  }
  // flavor made it through: some members carry service notes, echoed on requests
  assert.ok(ds.member.some(m => m.serviceNotes), 'some members should have serviceNotes')
  assert.ok(ds.service_request.some(s => s.instructions), 'some requests should echo member notes')
  // both trip types and a few date-only non-rides appear
  const tt = new Set(ds.service_request.map(s => s.transportationType))
  for (const t of ['Round Trip', 'One Way', 'None']) assert.ok(tt.has(t), `missing transport ${t}`)
})

test('inactive members come from the invented filler pool first', () => {
  const content = fullContentWithDest()
  const ds = buildDataset(content, 20260630)
  // person rows no longer carry fullName (DB-generated) — match fillers by
  // their name-derived email, which mirrors the builder's emailFor()
  const emailFor = (name) => name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@residents.test'
  const fillerEmails = new Set(content.people.figures
    .filter(f => f.bucket === 'invented-descendants').map(f => emailFor(f.name)))
  const fillerPersonIds = new Set(ds.person
    .filter(p => fillerEmails.has(p.email)).map(p => p.id))
  const inactive = ds.member.filter(m => m.status !== 'Active')
  assert.ok(inactive.length >= 1)
  const fillerMemberCount = ds.member.filter(m => fillerPersonIds.has(m.personId)).length
  const nonFillerInactive = inactive.filter(m => !fillerPersonIds.has(m.personId)).length
  // named notables only go inactive once the filler pool is exhausted
  assert.ok(nonFillerInactive === 0 || fillerMemberCount <= inactive.length,
    `${nonFillerInactive} named members inactive with ${fillerMemberCount} fillers available`)
})

test('standing requests: series re-book the same trip and share one booking identity', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  // a series = same member + service + destination + time-of-day slot
  const key = (s) => [s.memberPersonId, s.serviceName, s.destination, s.startTime].join('|')
  const groups = {}
  for (const s of ds.service_request) (groups[key(s)] ??= []).push(s)
  const series = Object.values(groups).filter(g => g.length > 1)
  // booked once: same staff creator and entry timestamp on every occurrence
  // (an unrelated re-draw of the same trip can collide on the key, so count
  // the well-formed series rather than asserting on every group)
  const wellFormed = series.filter(g =>
    new Set(g.map(s => s.createdUserId)).size === 1 && new Set(g.map(s => s.createdAt)).size === 1)
  assert.ok(wellFormed.length >= 20, `only ${wellFormed.length} standing series`)
  for (const g of wellFormed) {
    for (const s of g) assert.ok(s.createdAt.slice(0, 10) <= s.serviceDate, 'booking predates every occurrence')
  }
})

test('requests: wall-clock time model and Rides-only times', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  assert.ok(ds.service_request.length > 100)
  for (const sr of ds.service_request) {
    assert.ok(!('startAt' in sr) && !('finishAt' in sr), 'startAt/finishAt are dropped columns')
    assert.match(sr.serviceDate, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(sr.status !== 'Draft', 'Draft was excised in PR #83')
    const isRide = sr.serviceName.startsWith('Ride:')
    if (!isRide) {
      assert.equal(sr.timesFlexible, 1, 'non-Rides are always flexible')
      assert.equal(sr.startTime, null); assert.equal(sr.apptTime, null)
    } else if (sr.timesFlexible === 0) {
      assert.match(sr.startTime, /^\d{2}:\d{2}:00$/)
      assert.match(sr.finishTime, /^\d{2}:\d{2}:00$/)
      if (sr.transportationType === 'Round Trip') assert.match(sr.apptTime, /^\d{2}:\d{2}:00$/)
      else assert.equal(sr.apptTime, null)
    } else {
      assert.equal(sr.startTime, null)
    }
  }
})

test('requests: ride geography — home->out majority, out->home and NULL-start minorities', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  const rides = ds.service_request.filter(sr => sr.serviceName.startsWith('Ride:'))
  const homeOut = rides.filter(sr => sr.start === 'Home')
  const outHome = rides.filter(sr => sr.destination === 'Home')
  const noStart = rides.filter(sr => sr.start === null)
  assert.ok(homeOut.length > outHome.length && homeOut.length > noStart.length)
  assert.ok(outHome.length > 0 && noStart.length > 0)
  for (const sr of outHome) assert.ok(sr.startAddress, 'out->home rides carry the venue start address')
  // creators are the federation Staff/SC users (userIds 3 and 4 by construction order)
  assert.ok(ds.service_request.every(sr => [3, 4].includes(sr.createdUserId)))
})

test('members can hold several requests, but never two overlapping in time', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  const ms = (x) => Date.parse(x.replace(' ', 'T') + 'Z')
  // flexible requests (null times) block their nominal 15-minute slot, matching
  // the generator's internal dateOnly/flexible slot math (startMin = 4*60, durMin = 0)
  const span = (sr) => {
    const start = ms(`${sr.serviceDate} ${sr.startTime || '04:00:00'}`)
    const finish = sr.finishTime ? ms(`${sr.serviceDate} ${sr.finishTime}`) : start
    return [start, Math.max(finish, start + 15 * 60000)]
  }
  const byMember = {}
  for (const sr of ds.service_request) (byMember[sr.memberPersonId] ??= []).push(sr)
  const multi = Object.values(byMember).filter(list => list.length > 1)
  assert.ok(multi.length >= 10, `only ${multi.length} members have >1 request`)
  for (const list of Object.values(byMember)) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [aS, aE] = span(list[i]); const [bS, bE] = span(list[j])
        assert.ok(!(aS < bE && bS < aE),
          `member ${list[i].memberPersonId} double-booked: [${list[i].serviceDate} ${list[i].startTime}..${list[i].finishTime}] vs [${list[j].serviceDate} ${list[j].startTime}..${list[j].finishTime}]`)
      }
    }
  }
})

test('privacy: one published rule, acknowledged by every user (incl. the loader account)', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  assert.equal(ds.privacy_rules.length, 1)
  const rule = ds.privacy_rules[0]
  const userIds = new Set(ds.user_data.map(u => u.userId))
  assert.ok(userIds.has(rule.publishedByUserId))
  assert.ok(rule.content.length > 100 && rule.modifiedAt > rule.publishedAt)
  // every user has acked the current rule — the API's ack gate 403s anyone who hasn't
  const ackedUsers = new Set(ds.privacy_acknowledgement.map(a => a.userId))
  assert.equal(ackedUsers.size, ds.user_data.length)
  for (const a of ds.privacy_acknowledgement) {
    assert.equal(a.rulesId, rule.id)
    assert.ok(userIds.has(a.userId))
    assert.ok(a.acknowledgedAt >= rule.publishedAt, 'acks cannot precede publication')
    assert.doesNotThrow(() => JSON.parse(a.tokenClaims))
  }
  // the loader's machine account must exist and be acked, or import 403s itself
  const loader = ds.user_data.find(u => u.username === 'demo-loader@villagegreen.test')
  assert.ok(loader, 'demo-loader account must be pre-seeded')
  assert.ok(ackedUsers.has(loader.userId))
})

test('vss: ~25% of active volunteers get accounts; modifiedUserId is the VSS marker', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  const vssUsers = ds.user_data.filter(u => u.username.endsWith('@residents.test'))
  const activeVols = ds.volunteer.filter(v => v.active === 1).length
  assert.ok(Math.abs(vssUsers.length - activeVols * 0.25) <= activeVols * 0.08)
  // acks cover VSS users too (privacy built after them)
  assert.equal(ds.privacy_acknowledgement.length, ds.user_data.length)
  const vssIds = new Set(vssUsers.map(u => u.userId))
  const marked = ds.service_request.filter(sr => sr.modifiedUserId !== null)
  assert.ok(marked.length > 0, 'some requests carry the VSS marker')
  for (const sr of marked) {
    assert.ok(vssIds.has(sr.modifiedUserId), 'modifiedUserId must be a volunteer user, never staff')
    assert.ok(['Confirmed', 'Completed'].includes(sr.status))
    assert.ok(sr.modifiedAt >= sr.createdAt)
  }
})

test('notifications reference requests; recipients is a JSON string', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  const srIds = new Set(ds.service_request.map(s => s.id))
  for (const n of ds.notification_event) {
    assert.ok(srIds.has(n.serviceRequestId))
    assert.equal(typeof n.recipients, 'string')
    assert.doesNotThrow(() => JSON.parse(n.recipients))
  }
})

test('buildDataset is deterministic and complete', () => {
  const a = buildDataset(fullContentWithDest(), 20260630)
  const b = buildDataset(fullContentWithDest(), 20260630)
  assert.deepEqual(a, b)
  assert.equal(a.capability.length, 13)
  assert.ok(a.person.length >= 290, `person count ${a.person.length}`)
  assert.ok(a.service_request.length >= 180, `service_request count ${a.service_request.length}`)
  assert.ok(a.fcv_submission.length >= 30, `fcv_submission count ${a.fcv_submission.length}`)
})

test('all 10 villages have >=1 member and >=1 volunteer; big villages honor their mix', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  // build village-id -> {members, volunteers} count map via person.villageId join
  const byVillage = {}
  for (const v of ds.village) byVillage[v.id] = { name: v.name, m: 0, v: 0 }
  const personVillage = Object.fromEntries(ds.person.map(p => [p.id, p.villageId]))
  for (const row of ds.member) {
    const vid = personVillage[row.personId]
    if (vid != null) byVillage[vid].m++
  }
  for (const row of ds.volunteer) {
    const vid = personVillage[row.personId]
    if (vid != null) byVillage[vid].v++
  }
  // every village must have at least 1 member and 1 volunteer
  for (const [vid, counts] of Object.entries(byVillage)) {
    assert.ok(counts.m >= 1, `village ${counts.name} (id=${vid}) has 0 members`)
    assert.ok(counts.v >= 1, `village ${counts.name} (id=${vid}) has 0 volunteers`)
  }
  // big villages (113 total) honor their resolved mix: Arkham is volunteer-heavy
  // (~45/68), Quahog is memberHeavy (~68/45) — both sides comfortably >=40
  const villageByName = Object.fromEntries(ds.village.map(v => [v.name, v.id]))
  const arkham = byVillage[villageByName['Arkham']]
  assert.ok(arkham.m >= 40 && arkham.v > arkham.m, `Arkham ${arkham.m}m/${arkham.v}v not volunteer-heavy`)
  const quahog = byVillage[villageByName['Quahog']]
  assert.ok(quahog.v >= 40 && quahog.m > quahog.v, `Quahog ${quahog.m}m/${quahog.v}v not member-heavy`)
})
