import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../lib/client.js'
import { tokens } from '../lib/context.js'
import { villages, persons, volunteers as vol } from '../setup/fixtures.js'

// SPEC (not yet implemented). Every Volunteer handler is stubbed (`res.json({})`),
// so each assertion is a `todo`: reported as known-failing, does NOT fail the run,
// and flips to a real passing guard once the handler is implemented (drop the
// todo flag then). Auth/scope gating is verified GREEN in authz.test.js.
// Capability reference ids used below: 1=Errands, 2=Friends, 5=Rides.
const STUB = 'Volunteer.* handlers are stubbed (res.json({}))'
const VOLUNTEERS = '/volunteers'
const quahog = String(villages.quahog.id)

// Throwaway Quahog person + volunteer for the create/update/delete specs (unique
// fullName per call — person has a unique (village_id, full_name) index). Only
// does real work once the Volunteer endpoints exist.
async function makeVolunteer (token, { label, capabilityIds } = {}) {
  const person = await vgFetch('/persons', { token, body: { villageId: quahog, fullName: `Throwaway ${label}` } })
  assert.equal(person.status, 201, 'precondition: person created')
  const created = await vgFetch(VOLUNTEERS, { token, body: { personId: person.json.personId, capabilityIds } })
  assert.equal(created.status, 201, 'volunteer created')
  return created.json
}

// ---- list / read ----

test('GET /volunteers returns the caller\'s granted-village volunteers as an array', { todo: STUB }, async () => {
  const { status, json } = await vgFetch(VOLUNTEERS, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json), 'body must be an array of volunteers')
  const names = json.map(v => v.fullName)
  assert.ok(names.includes(persons.quahogVolunteer.fullName), 'includes the Quahog volunteer')
  assert.ok(!names.includes(persons.innsmouthVolunteer.fullName), 'must not leak the Innsmouth volunteer')
  assert.ok(!names.includes(persons.miskatonicVolunteer.fullName), 'must not leak the Miskatonic volunteer')
})

test('GET /volunteers is grant-scoped per caller (full_v2 sees Innsmouth, not Quahog)', { todo: STUB }, async () => {
  const { status, json } = await vgFetch(VOLUNTEERS, { token: tokens.users.full_v2 })
  assert.equal(status, 200)
  const names = json.map(v => v.fullName)
  assert.ok(names.includes(persons.innsmouthVolunteer.fullName), 'includes the Innsmouth volunteer')
  assert.ok(!names.includes(persons.quahogVolunteer.fullName), 'must not leak the Quahog volunteer')
})

test('GET /volunteers/{id} within the caller\'s grant returns the volunteer', { todo: STUB }, async () => {
  const { status, json } = await vgFetch(`${VOLUNTEERS}/${vol.quahog.id}`, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.equal(json.volunteerId, String(vol.quahog.id))
  assert.equal(json.personId, String(persons.quahogVolunteer.id))
  assert.equal(json.fullName, persons.quahogVolunteer.fullName)
})

test('GET /volunteers/{id} for a volunteer outside the caller\'s grants -> 404', { todo: STUB }, async () => {
  const { status } = await vgFetch(`${VOLUNTEERS}/${vol.innsmouth.id}`, { token: tokens.users.full_v1 })
  assert.equal(status, 404)
})

// ---- create / capabilities / update / delete ----

test('POST /volunteers creates a volunteer with capabilities', { todo: STUB }, async () => {
  const person = await vgFetch('/persons', {
    token: tokens.users.full_v1,
    body: { villageId: quahog, fullName: 'Brand New Volunteer' },
  })
  assert.equal(person.status, 201)
  const { status, json } = await vgFetch(VOLUNTEERS, {
    token: tokens.users.full_v1,
    body: { personId: person.json.personId, capabilityIds: ['1', '5'] }, // Errands, Rides
  })
  assert.equal(status, 201)
  assert.ok(json.volunteerId, 'returns a new volunteerId')
  assert.equal(json.personId, person.json.personId)
})

test('PUT /volunteers/{id}/capabilities sets the capability list', { todo: STUB }, async () => {
  const volunteer = await makeVolunteer(tokens.users.full_v1, { label: 'PUTcaps' })
  const { status, json } = await vgFetch(`${VOLUNTEERS}/${volunteer.volunteerId}/capabilities`, {
    token: tokens.users.full_v1,
    method: 'PUT',
    body: ['1', '5'], // Errands, Rides
  })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json.capabilities), 'volunteer carries a capabilities array')
  assert.ok(json.capabilities.includes('Errands') && json.capabilities.includes('Rides'),
    `expected Errands + Rides, got ${JSON.stringify(json.capabilities)}`)
})

test('PATCH /volunteers/{id} updates capabilities', { todo: STUB }, async () => {
  const volunteer = await makeVolunteer(tokens.users.full_v1, { label: 'PATCHcaps', capabilityIds: ['1'] })
  const { status, json } = await vgFetch(`${VOLUNTEERS}/${volunteer.volunteerId}`, {
    token: tokens.users.full_v1,
    method: 'PATCH',
    body: { capabilityIds: ['2'] }, // Friends
  })
  assert.equal(status, 200)
  assert.ok(json.capabilities.includes('Friends'), `expected Friends, got ${JSON.stringify(json.capabilities)}`)
})

test('DELETE /volunteers/{id} removes the volunteer', { todo: STUB }, async () => {
  const volunteer = await makeVolunteer(tokens.users.full_v1, { label: 'DELvol' })
  const del = await vgFetch(`${VOLUNTEERS}/${volunteer.volunteerId}`, { token: tokens.users.full_v1, method: 'DELETE' })
  assert.equal(del.status, 200)
  const after = await vgFetch(`${VOLUNTEERS}/${volunteer.volunteerId}`, { token: tokens.users.full_v1 })
  assert.equal(after.status, 404, 'deleted volunteer is gone')
})

// ---- cross-village write authz ----

test('POST /volunteers for a person outside the caller\'s grants is denied', { todo: STUB }, async () => {
  const { status } = await vgFetch(VOLUNTEERS, {
    token: tokens.users.full_v1,
    body: { personId: String(persons.innsmouthVolunteer.id) },
  })
  assert.ok(status === 403 || status === 404, `expected denial, got ${status}`)
})
