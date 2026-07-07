import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { villages, persons } from '../../setup/fixtures.js'

// GET /volunteers (the only flat volunteer endpoint that exists) plus the
// volunteer-role lifecycle on the person sub-resource: PUT/PATCH/DELETE
// /persons/{personId}/volunteer — main's design, superseding the flat
// /volunteers/{id} CRUD this suite originally specced (those todos are
// retired). The write endpoints respond with the full Person expanded with the
// volunteerDetail projection. The list reads from the active_volunteer view,
// so only volunteers with active=1 appear.
//
// Writes use throwaway Quahog persons so the canonical fixtures stay intact.
// Like the Person writes (finding #5), the handlers apply NO village-grant
// check — the cross-village probe at the bottom is RED until that's fixed.
//
// Capability reference ids (static seed): 1=Errands, 2=Friends, 5=Rides.
// Volunteer vettings are NOT exercised: the vetting_type table has no static
// rows and no write endpoint, so any vettingTypeId would violate the FK.
const VOLUNTEERS = '/volunteers'
const quahog = String(villages.quahog.id)
const volPath = id => `/persons/${id}/volunteer`

async function makePerson (token, lastName, body = {}) {
  const res = await vgFetch('/persons', {
    token, body: { villageId: quahog, firstName: 'Throwaway', lastName, ...body },
  })
  assert.equal(res.status, 201, 'precondition: person created')
  return res.json.personId
}

async function listedNames (token, query) {
  const { status, json } = await vgFetch(VOLUNTEERS, { token, query })
  assert.equal(status, 200)
  return json.map(v => v.fullName)
}

// ---- list (GREEN — grant-scoped via active_volunteer) ----

test('GET /volunteers returns the caller\'s granted-village volunteers', async () => {
  const { status, json } = await vgFetch(VOLUNTEERS, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  const mine = json.find(v => v.fullName === persons.quahogVolunteer.fullName)
  assert.ok(mine, 'includes the Quahog volunteer')
  assert.ok(mine.volunteerId && mine.personId, 'rows carry volunteerId + personId')
  assert.ok(Array.isArray(mine.capabilities), 'rows carry a capabilities array')
  const names = json.map(v => v.fullName)
  assert.ok(!names.includes(persons.innsmouthVolunteer.fullName), 'must not leak the Innsmouth volunteer')
  assert.ok(!names.includes(persons.miskatonicVolunteer.fullName), 'must not leak the Miskatonic volunteer')
})

test('GET /volunteers is grant-scoped per caller (full_v2 sees Innsmouth, not Quahog)', async () => {
  const names = await listedNames(tokens.users.full_v2)
  assert.ok(names.includes(persons.innsmouthVolunteer.fullName), 'includes the Innsmouth volunteer')
  assert.ok(!names.includes(persons.quahogVolunteer.fullName), 'must not leak the Quahog volunteer')
})

test('GET /volunteers: grantless admin sees none plain, all with elevate=true', async () => {
  const plain = await listedNames(tokens.users.admin)
  assert.deepEqual(plain, [], 'admin has no grants, so the ungrant-elevated list is empty')
  const elevated = await listedNames(tokens.users.admin, { elevate: 'true' })
  for (const p of [persons.quahogVolunteer, persons.innsmouthVolunteer, persons.miskatonicVolunteer]) {
    assert.ok(elevated.includes(p.fullName), `elevated list includes ${p.fullName}`)
  }
})

// ---- lifecycle on /persons/{personId}/volunteer (GREEN) ----

test('PUT grants the volunteer role with capabilities', async () => {
  const id = await makePerson(tokens.users.full_v1, 'VPut')
  const { status, json } = await vgFetch(volPath(id), {
    token: tokens.users.full_v1, method: 'PUT',
    body: { active: true, capabilityIds: ['1', '5'] }, // Errands, Rides
  })
  assert.equal(status, 200)
  assert.equal(json.personId, id, 'responds with the person')
  assert.ok(json.volunteerDetail, 'response carries volunteerDetail')
  assert.equal(json.volunteerDetail.personId, id)
  assert.deepEqual([...json.volunteerDetail.capabilities].sort(), ['Errands', 'Rides'])

  const names = await listedNames(tokens.users.full_v1)
  assert.ok(names.includes('VPut, Throwaway'), 'active volunteer appears in GET /volunteers')
})

test('PUT without `active` leaves the volunteer out of the active list', async () => {
  // putVolunteer defaults every omitted scalar to null — including active — so
  // a PUT that only sets capabilities creates a volunteer the active_volunteer
  // view (active=1) filters out. Surprising but current behavior; pinned here.
  const id = await makePerson(tokens.users.full_v1, 'VInactive')
  const { status } = await vgFetch(volPath(id), {
    token: tokens.users.full_v1, method: 'PUT', body: { capabilityIds: ['2'] },
  })
  assert.equal(status, 200)
  const names = await listedNames(tokens.users.full_v1)
  assert.ok(!names.includes('VInactive, Throwaway'), 'volunteer with active=null is hidden from the list')
})

test('PATCH replaces the capability set and toggles active-list membership', async () => {
  const id = await makePerson(tokens.users.full_v1, 'VPatch')
  await vgFetch(volPath(id), {
    token: tokens.users.full_v1, method: 'PUT', body: { active: true, capabilityIds: ['1'] },
  })

  const patched = await vgFetch(volPath(id), {
    token: tokens.users.full_v1, method: 'PATCH', body: { capabilityIds: ['2'] }, // -> Friends only
  })
  assert.equal(patched.status, 200)
  assert.deepEqual(patched.json.volunteerDetail.capabilities, ['Friends'])
  assert.ok((await listedNames(tokens.users.full_v1)).includes('VPatch, Throwaway'), 'still active')

  const deactivated = await vgFetch(volPath(id), {
    token: tokens.users.full_v1, method: 'PATCH', body: { active: false },
  })
  assert.equal(deactivated.status, 200)
  assert.ok(!(await listedNames(tokens.users.full_v1)).includes('VPatch, Throwaway'),
    'deactivated volunteer drops out of the active_volunteer list')
})

test('PATCH associates villages (echoed in volunteerDetail)', async () => {
  const id = await makePerson(tokens.users.full_v1, 'VAssoc')
  await vgFetch(volPath(id), { token: tokens.users.full_v1, method: 'PUT', body: { active: true } })
  const { status, json } = await vgFetch(volPath(id), {
    token: tokens.users.full_v1, method: 'PATCH',
    body: { associateVillageIds: [String(villages.innsmouth.id)] },
  })
  assert.equal(status, 200)
  const assoc = json.volunteerDetail.associateVillages ?? []
  assert.ok(assoc.some(v => v.name === villages.innsmouth.name),
    `expected Innsmouth associate, got ${JSON.stringify(assoc)}`)
})

test('DELETE revokes the volunteer role; a second DELETE 404s', async () => {
  const id = await makePerson(tokens.users.full_v1, 'VDel')
  await vgFetch(volPath(id), { token: tokens.users.full_v1, method: 'PUT', body: { active: true } })
  const del = await vgFetch(volPath(id), { token: tokens.users.full_v1, method: 'DELETE' })
  assert.equal(del.status, 204)
  const again = await vgFetch(volPath(id), { token: tokens.users.full_v1, method: 'DELETE' })
  assert.equal(again.status, 404)
  const names = await listedNames(tokens.users.full_v1)
  assert.ok(!names.includes('VDel, Throwaway'), 'revoked volunteer is gone from the list')
})

test('PATCH on a person with no volunteer role -> 404', async () => {
  const id = await makePerson(tokens.users.full_v1, 'VNone')
  const { status } = await vgFetch(volPath(id), {
    token: tokens.users.full_v1, method: 'PATCH', body: { notes: 'x' },
  })
  assert.equal(status, 404)
})

test('PUT for a person with no home village -> 422', async () => {
  const res = await vgFetch('/persons', {
    token: tokens.users.full_v1, body: { firstName: 'Throwaway', lastName: 'VNoVillage' },
  })
  assert.equal(res.status, 201, 'precondition: villageless person created')
  const { status } = await vgFetch(volPath(res.json.personId), {
    token: tokens.users.full_v1, method: 'PUT', body: { active: true },
  })
  assert.equal(status, 422)
})

// ---- cross-village write: MUST be denied (RED — finding #5) ----

test('PUT volunteer for a person outside the caller\'s grants is denied', async () => {
  // full_v2 (Innsmouth only) grants a volunteer role to a Quahog person. A
  // successful insecure write is undone so the rest of the run is unaffected.
  const id = await makePerson(tokens.users.full_v1, 'VCross')
  const res = await vgFetch(volPath(id), {
    token: tokens.users.full_v2, method: 'PUT', body: { active: true },
  })
  if (res.status === 200) {
    await vgFetch(volPath(id), { token: tokens.users.full_v1, method: 'DELETE' })
  }
  assert.ok(res.status === 403 || res.status === 404, `expected denial, got ${res.status}`)
})
