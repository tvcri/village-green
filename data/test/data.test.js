import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { makeRng } from '../generator/rng.js'
import { VILLAGES, ROLE, SERVICE_CATEGORIES, NO_LOCATION_SERVICES } from '../generator/constants.js'
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
  const { village, villageIdByName } = buildVillagesAndUsers(content, makeRng(1))
  assert.equal(village.length, 10)
  assert.equal(village[0].id, 1)
  assert.equal(villageIdByName[VILLAGES[0].name], 1)
})

test('persons: no address key, unique (village,name), themed big villages', () => {
  const { village, villageIdByName } = buildVillagesAndUsers(fullContent, makeRng(1))
  const { person, byVillage } = buildPersons(fullContent, villageIdByName, makeRng(1))
  for (const p of person) {
    assert.ok(!('address' in p), 'person rows must not set the generated address column')
    assert.equal(typeof p.fullName, 'string')
    assert.ok(p.villageId >= 1 && p.villageId <= 10)
  }
  // unique (villageId, fullName)
  const keys = person.map(p => `${p.villageId}::${p.fullName.toLowerCase()}`)
  assert.equal(keys.length, new Set(keys).size)
  // big villages (Arkham=1, Quahog=2) each have >=50 members and >=50 volunteers
  for (const vid of [villageIdByName['Arkham'], villageIdByName['Quahog']]) {
    assert.ok(byVillage[vid].members.length >= 50, `members in ${vid}`)
    assert.ok(byVillage[vid].volunteers.length >= 50, `volunteers in ${vid}`)
  }
})

test('membership: status/active invariants and <=10% member/volunteer overlap', () => {
  const { villageIdByName } = buildVillagesAndUsers(fullContent, makeRng(1))
  const { person, byVillage } = buildPersons(fullContent, villageIdByName, makeRng(1))
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

  // dataset-wide mix targets ~60/40 members:volunteers
  const memberShare = m.member.length / (m.member.length + m.volunteer.length)
  assert.ok(memberShare > 0.55 && memberShare < 0.65, `member share ${memberShare.toFixed(2)} not ~0.60`)
  // ~66% of members carry a standing service note (echoed into request instructions)
  const noteShare = m.member.filter(r => r.serviceNotes).length / m.member.length
  assert.ok(noteShare > 0.55 && noteShare < 0.78, `serviceNotes share ${noteShare.toFixed(2)} not ~0.66`)

  // junctions reference valid parents
  const volIds = new Set(m.volunteer.map(v => v.id))
  for (const vc of m.volunteer_capability) assert.ok(volIds.has(vc.volunteerId))
  for (const vv of m.volunteer_vetting) assert.ok(volIds.has(vv.volunteerId))
  const disIds = new Set(m.disability.map(d => d.id))
  for (const pd of m.person_disability) assert.ok(disIds.has(pd.disabilityId) && personIds.has(pd.personId))
})

test('users/grants: admin, multi-village coordinator, and zero-grants user exist', () => {
  const { user_data, village_grant } = buildVillagesAndUsers(content, makeRng(1))
  // every grant references a real user and a village in 1..10, role 1..4
  const userIds = new Set(user_data.map(u => u.userId))
  for (const g of village_grant) {
    assert.ok(userIds.has(g.userId))
    assert.ok(g.villageId >= 1 && g.villageId <= 10)
    assert.ok(g.roleId >= 1 && g.roleId <= 4)
  }
  // a coordinator with grants in >= 3 villages (meta roll-up)
  const byUser = {}
  for (const g of village_grant) (byUser[g.userId] ||= new Set()).add(g.villageId)
  assert.ok(Object.values(byUser).some(s => s.size >= 3), 'need a 3+ village coordinator')
  // at least one user with no grants at all
  assert.ok(user_data.some(u => !village_grant.some(g => g.userId === u.userId)), 'need a zero-grants user')
  // every role value appears somewhere
  const roles = new Set(village_grant.map(g => g.roleId))
  for (const r of Object.values(ROLE)) assert.ok(roles.has(r), `missing role ${r}`)
})

test('grants cover every role in every village; requests are attributed to a manager/owner', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  // the blanket-owner dev admin doesn't count toward per-village coverage
  const adminIds = new Set(ds.user_data.filter(u => u.username === 'admin').map(u => u.userId))
  const count = {}
  for (const g of ds.village_grant) {
    if (adminIds.has(g.userId)) continue
    count[g.villageId] = count[g.villageId] || {}
    count[g.villageId][g.roleId] = (count[g.villageId][g.roleId] || 0) + 1
  }
  const bigIds = new Set(ds.village.filter(v => ['Arkham', 'Quahog'].includes(v.name)).map(v => v.id))
  for (const v of ds.village) {
    for (const [roleName, roleId] of Object.entries(ROLE)) {
      const n = (count[v.id] || {})[roleId] || 0
      assert.ok(n >= 1, `village ${v.name} has no ${roleName} user`)
      if (bigIds.has(v.id)) assert.ok(n >= 2 && n <= 3, `big village ${v.name} should have 2-3 ${roleName} users, has ${n}`)
    }
  }
  // every service request is created by a manager or owner of its own village
  const creatorOk = new Set(ds.village_grant
    .filter(g => !adminIds.has(g.userId) && (g.roleId === ROLE.manage || g.roleId === ROLE.owner))
    .map(g => `${g.villageId}:${g.userId}`))
  for (const sr of ds.service_request) {
    assert.ok(sr.createdUserId, `request ${sr.id} has no creating user`)
    assert.ok(creatorOk.has(`${sr.villageId}:${sr.createdUserId}`),
      `request ${sr.id} creator ${sr.createdUserId} is not a manager/owner of village ${sr.villageId}`)
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
  const statuses = new Set(['Draft', 'Open', 'Confirmed', 'Completed', 'Member cancelled', 'Volunteer cancelled', 'Hub cancelled'])
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
  for (const s of ['Open', 'Confirmed', 'Completed', 'Draft']) assert.ok(seen.has(s), `missing status ${s}`)
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
    // UI time flow: RT = Start -> Arrival -> Return -> Finish; otherwise no appt/return
    assert.ok(sr.startAt <= sr.finishAt)
    if (sr.transportationType === 'Round Trip') {
      assert.ok(sr.apptTime && sr.returnTime, 'round trips seed arrival + return')
      assert.ok(sr.startAt < sr.apptTime && sr.apptTime < sr.returnTime && sr.returnTime < sr.finishAt,
        `RT time order: ${sr.startAt} ${sr.apptTime} ${sr.returnTime} ${sr.finishAt}`)
    } else {
      assert.equal(sr.apptTime, null)
      assert.equal(sr.returnTime, null)
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
  const fillerNames = new Set(content.people.figures
    .filter(f => f.bucket === 'invented-descendants').map(f => f.name.toLowerCase()))
  const fillerPersonIds = new Set(ds.person
    .filter(p => fillerNames.has(p.fullName.toLowerCase())).map(p => p.id))
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
  const key = (s) => [s.memberPersonId, s.serviceName, s.destination, s.startAt.slice(11)].join('|')
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
    for (const s of g) assert.ok(s.createdAt <= s.startAt, 'booking predates every occurrence')
  }
})

test('members can hold several requests, but never two overlapping in time', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  const ms = (x) => Date.parse(x.replace(' ', 'T') + 'Z')
  // date-only requests (start == finish) block their nominal 15-minute slot
  const span = (sr) => [ms(sr.startAt), Math.max(ms(sr.finishAt), ms(sr.startAt) + 15 * 60000)]
  const byMember = {}
  for (const sr of ds.service_request) (byMember[sr.memberPersonId] ??= []).push(sr)
  const multi = Object.values(byMember).filter(list => list.length > 1)
  assert.ok(multi.length >= 10, `only ${multi.length} members have >1 request`)
  for (const list of Object.values(byMember)) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [aS, aE] = span(list[i]); const [bS, bE] = span(list[j])
        assert.ok(!(aS < bE && bS < aE),
          `member ${list[i].memberPersonId} double-booked: [${list[i].startAt}..${list[i].finishAt}] vs [${list[j].startAt}..${list[j].finishAt}]`)
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

test('all 10 villages have >=1 member and >=1 volunteer; big villages have >=50 of each', () => {
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
  // big villages (Arkham=id1, Quahog=id2) must have >=50 members and >=50 volunteers
  const villageByName = Object.fromEntries(ds.village.map(v => [v.name, v.id]))
  for (const bigName of ['Arkham', 'Quahog']) {
    const vid = villageByName[bigName]
    assert.ok(byVillage[vid].m >= 50, `big village ${bigName} has only ${byVillage[vid].m} members`)
    assert.ok(byVillage[vid].v >= 50, `big village ${bigName} has only ${byVillage[vid].v} volunteers`)
  }
})
