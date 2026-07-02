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
    assert.equal(typeof p.full_name, 'string')
    assert.ok(p.village_id >= 1 && p.village_id <= 10)
  }
  // unique (village_id, full_name)
  const keys = person.map(p => `${p.village_id}::${p.full_name.toLowerCase()}`)
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
    assert.ok(personIds.has(row.person_id))
    assert.equal(typeof row.status, 'string')
    if (row.status !== 'Active') assert.ok(row.drop_reason, 'inactive members need a drop_reason')
  }
  assert.ok(m.member.some(r => r.status === 'Active'))
  assert.ok(m.member.some(r => r.status !== 'Active'))

  for (const row of m.volunteer) {
    assert.ok(personIds.has(row.person_id))
    assert.ok(row.active === 0 || row.active === 1)
  }
  assert.ok(m.volunteer.some(r => r.active === 1) && m.volunteer.some(r => r.active === 0))

  // overlap: persons who are BOTH member and volunteer <= 10% of volunteers
  // (members receive services; volunteers provide them — mostly distinct populations)
  const memberPersons = new Set(m.member.map(r => r.person_id))
  const both = m.volunteer.filter(r => memberPersons.has(r.person_id)).length
  assert.ok(both <= Math.ceil(m.volunteer.length * 0.10), `overlap ${both}/${m.volunteer.length}`)

  // junctions reference valid parents
  const volIds = new Set(m.volunteer.map(v => v.id))
  for (const vc of m.volunteer_capability) assert.ok(volIds.has(vc.volunteer_id))
  for (const vv of m.volunteer_vetting) assert.ok(volIds.has(vv.volunteer_id))
  const disIds = new Set(m.disability.map(d => d.id))
  for (const pd of m.person_disability) assert.ok(disIds.has(pd.disability_id) && personIds.has(pd.person_id))
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

test('service requests honor deriveStatus and reference valid people', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  const personIds = new Set(ds.person.map(p => p.id))
  const villageIds = new Set(ds.village.map(v => v.id))
  const statuses = new Set(['Draft', 'Open', 'Confirmed', 'Completed', 'Member cancelled', 'Volunteer cancelled', 'Hub cancelled'])
  for (const sr of ds.service_request) {
    assert.ok(villageIds.has(sr.village_id))
    assert.ok(statuses.has(sr.status), `bad status ${sr.status}`)
    if (sr.status === 'Confirmed' || sr.status === 'Completed') assert.ok(sr.volunteer_person_id, `${sr.status} needs a volunteer`)
    if (sr.status === 'Open') assert.equal(sr.volunteer_person_id, null)
    if (sr.member_person_id) assert.ok(personIds.has(sr.member_person_id))
    if (sr.volunteer_person_id) assert.ok(personIds.has(sr.volunteer_person_id))
  }
  // a spread of statuses is present
  const seen = new Set(ds.service_request.map(s => s.status))
  for (const s of ['Open', 'Confirmed', 'Completed', 'Draft']) assert.ok(seen.has(s), `missing status ${s}`)
})

test('service requests match the UI-enforced category/transport/location rules', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  const noteByPerson = Object.fromEntries(ds.member.filter(m => m.service_notes).map(m => [m.person_id, m.service_notes]))
  for (const sr of ds.service_request) {
    assert.ok(SERVICE_CATEGORIES.includes(sr.service_name), `bad category ${sr.service_name}`)
    const isRide = sr.service_name.startsWith('Ride:')
    if (isRide) {
      assert.ok(['Round Trip', 'One Way'].includes(sr.transportation_type), `ride needs RT/OW, got ${sr.transportation_type}`)
      assert.ok(sr.destination, 'rides require a destination')
    } else {
      assert.equal(sr.transportation_type, 'None')
    }
    if (NO_LOCATION_SERVICES.includes(sr.service_name)) {
      for (const f of ['destination', 'address', 'city', 'state', 'zip', 'phone']) {
        assert.equal(sr[f], null, `${sr.service_name} must not set ${f}`)
      }
    } else {
      // grid shows Destination + City columns — both must render
      assert.ok(sr.destination, 'location services need a destination')
      assert.ok(sr.city, 'location services need a city')
      assert.ok(sr.address, 'location services need an address')
    }
    // UI time flow: RT = Start -> Arrival -> Return -> Finish; otherwise no appt/return
    assert.ok(sr.start_at <= sr.finish_at)
    if (sr.transportation_type === 'Round Trip') {
      assert.ok(sr.appt_time && sr.return_time, 'round trips seed arrival + return')
      assert.ok(sr.start_at < sr.appt_time && sr.appt_time < sr.return_time && sr.return_time < sr.finish_at,
        `RT time order: ${sr.start_at} ${sr.appt_time} ${sr.return_time} ${sr.finish_at}`)
    } else {
      assert.equal(sr.appt_time, null)
      assert.equal(sr.return_time, null)
    }
    // instructions echo the member's standing service note (or are absent)
    if (sr.instructions) assert.equal(sr.instructions, noteByPerson[sr.member_person_id])
  }
  // flavor made it through: some members carry service notes, echoed on requests
  assert.ok(ds.member.some(m => m.service_notes), 'some members should have service_notes')
  assert.ok(ds.service_request.some(s => s.instructions), 'some requests should echo member notes')
  // both trip types and a few date-only non-rides appear
  const tt = new Set(ds.service_request.map(s => s.transportation_type))
  for (const t of ['Round Trip', 'One Way', 'None']) assert.ok(tt.has(t), `missing transport ${t}`)
})

test('notifications reference requests; recipients is a JSON string', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  const srIds = new Set(ds.service_request.map(s => s.id))
  for (const n of ds.notification_event) {
    assert.ok(srIds.has(n.service_request_id))
    assert.equal(typeof n.recipients, 'string')
    assert.doesNotThrow(() => JSON.parse(n.recipients))
  }
})

test('buildDataset is deterministic and complete', () => {
  const a = buildDataset(fullContentWithDest(), 20260630)
  const b = buildDataset(fullContentWithDest(), 20260630)
  assert.deepEqual(a, b)
  assert.equal(a.capability.length, 13)
  assert.ok(a.person.length >= 220, `person count ${a.person.length}`)
  assert.ok(a.service_request.length >= 150, `service_request count ${a.service_request.length}`)
  assert.ok(a.fcv_submission.length >= 30, `fcv_submission count ${a.fcv_submission.length}`)
})

test('all 10 villages have >=1 member and >=1 volunteer; big villages have >=50 of each', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  // build village-id -> {members, volunteers} count map via person.village_id join
  const byVillage = {}
  for (const v of ds.village) byVillage[v.id] = { name: v.name, m: 0, v: 0 }
  const personVillage = Object.fromEntries(ds.person.map(p => [p.id, p.village_id]))
  for (const row of ds.member) {
    const vid = personVillage[row.person_id]
    if (vid != null) byVillage[vid].m++
  }
  for (const row of ds.volunteer) {
    const vid = personVillage[row.person_id]
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
