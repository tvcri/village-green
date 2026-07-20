import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, persons } from '../../setup/fixtures.js'

// GET /volunteers (the only flat volunteer endpoint) plus the volunteer-role
// lifecycle on the person sub-resource: PUT/PATCH/DELETE
// /persons/{personId}/volunteer. The write endpoints respond with the full
// Person expanded with the `volunteer` projection (post-#56 property name;
// volunteerDetail is gone). The list always reads the active_volunteer view
// (active=1), scoped to the caller's volunteer:read grants — federation
// readers see every village; there is no villageId (or elevate) param.
//
// Post-#56, volunteer:write lives only at federation scope, so the lifecycle
// runs as staff; the village-user denial is pinned at the bottom (fixed by
// #56 — was RED finding #5). Throwaway persons live in the scratch village
// (id 4), the one village tests may mutate freely — staff's federation-wide
// list is used to observe them.
//
// Capability reference ids (static seed): 1=Errands, 2=Friends, 5=Rides.
// Volunteer vettings are NOT exercised: the vetting_type table has no static
// rows and no write endpoint, so any vettingTypeId would violate the FK.
const scratch = String(villages.scratch.id)
const staff = tokens.users.staff

async function makePerson (lastName, body = {}) {
  const res = await vgCall('createPerson', {}, {
    token: staff, body: { villageId: scratch, firstName: 'Throwaway', lastName, ...body },
  })
  assert.equal(res.status, 201, 'precondition: person created')
  return res.json.personId
}

async function listedNames (token) {
  const { status, json } = await vgCall('getVolunteers', {}, { token })
  assert.equal(status, 200)
  return json.map(v => v.fullName)
}

// ---- list (GREEN — grant-scoped via active_volunteer) ----

test('GET /volunteers returns the caller\'s granted-village volunteers', async () => {
  const { status, json } = await vgCall('getVolunteers', {}, { token: tokens.users.full_v1 })
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

test('GET /volunteers: federation readers see every village on a plain call', async () => {
  // Fixed by #56: admin's wildcard is a federation read — the old
  // "grantless admin sees none without elevate" behavior is gone, and
  // elevate is no longer declared on this operation.
  for (const token of [tokens.users.admin, tokens.users.board]) {
    const names = await listedNames(token)
    for (const p of [persons.quahogVolunteer, persons.innsmouthVolunteer, persons.miskatonicVolunteer]) {
      assert.ok(names.includes(p.fullName), `federation list includes ${p.fullName}`)
    }
  }
})

// ---- lifecycle on /persons/{personId}/volunteer (GREEN, staff) ----

test('PUT grants the volunteer role with capabilities', async () => {
  const personId = await makePerson('VPut')
  const { status, json } = await vgCall('putPersonVolunteer', { personId }, {
    token: staff,
    body: { active: true, capabilityIds: ['1', '5'] }, // Errands, Rides
  })
  assert.equal(status, 200)
  assert.equal(json.personId, personId, 'responds with the person')
  assert.ok(json.volunteer, 'response carries the volunteer projection')
  assert.equal(json.volunteer.personId, personId)
  assert.deepEqual([...json.volunteer.capabilities].sort(), ['Errands', 'Rides'])

  const names = await listedNames(staff)
  assert.ok(names.includes('VPut, Throwaway'), 'active volunteer appears in GET /volunteers')
})

test('PUT without `active` leaves the volunteer out of the active list', async () => {
  // putVolunteer defaults every omitted scalar to null — including active — so
  // a PUT that only sets capabilities creates a volunteer the active_volunteer
  // view (active=1) filters out. Surprising but current behavior; pinned here.
  const personId = await makePerson('VInactive')
  const { status } = await vgCall('putPersonVolunteer', { personId }, {
    token: staff, body: { capabilityIds: ['2'] },
  })
  assert.equal(status, 200)
  const names = await listedNames(staff)
  assert.ok(!names.includes('VInactive, Throwaway'), 'volunteer with active=null is hidden from the list')
})

test('PATCH replaces the capability set and toggles active-list membership', async () => {
  const personId = await makePerson('VPatch')
  await vgCall('putPersonVolunteer', { personId }, {
    token: staff, body: { active: true, capabilityIds: ['1'] },
  })

  const patched = await vgCall('patchPersonVolunteer', { personId }, {
    token: staff, body: { capabilityIds: ['2'] }, // -> Friends only
  })
  assert.equal(patched.status, 200)
  assert.deepEqual(patched.json.volunteer.capabilities, ['Friends'])
  assert.ok((await listedNames(staff)).includes('VPatch, Throwaway'), 'still active')

  const deactivated = await vgCall('patchPersonVolunteer', { personId }, {
    token: staff, body: { active: false },
  })
  assert.equal(deactivated.status, 200)
  assert.ok(!(await listedNames(staff)).includes('VPatch, Throwaway'),
    'deactivated volunteer drops out of the active_volunteer list')
})

test('PATCH associates villages (echoed in the volunteer projection)', async () => {
  const personId = await makePerson('VAssoc')
  await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { active: true } })
  const { status, json } = await vgCall('patchPersonVolunteer', { personId }, {
    token: staff,
    body: { associateVillageIds: [String(villages.innsmouth.id)] },
  })
  assert.equal(status, 200)
  const assoc = json.volunteer.associateVillages ?? []
  assert.ok(assoc.some(v => v.name === villages.innsmouth.name),
    `expected Innsmouth associate, got ${JSON.stringify(assoc)}`)
})

test('DELETE revokes the volunteer role; a second DELETE 404s', async () => {
  const personId = await makePerson('VDel')
  await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { active: true } })
  const del = await vgCall('deletePersonVolunteer', { personId }, { token: staff })
  assert.equal(del.status, 204)
  const again = await vgCall('deletePersonVolunteer', { personId }, { token: staff })
  assert.equal(again.status, 404)
  const names = await listedNames(staff)
  assert.ok(!names.includes('VDel, Throwaway'), 'revoked volunteer is gone from the list')
})

test('PATCH on a person with no volunteer role -> 404', async () => {
  const personId = await makePerson('VNone')
  const { status } = await vgCall('patchPersonVolunteer', { personId }, {
    token: staff, body: { notes: 'x' },
  })
  assert.equal(status, 404)
})

test('PUT for a person with no home village -> 422', async () => {
  // A villageless person is federation-scoped, so only staff/admin can create
  // one; the volunteer role still requires a home village -> 422.
  const res = await vgCall('createPerson', {}, {
    token: staff, body: { firstName: 'Throwaway', lastName: 'VNoVillage' },
  })
  assert.equal(res.status, 201, 'precondition: villageless person created')
  const { status } = await vgCall('putPersonVolunteer', { personId: res.json.personId }, {
    token: staff, body: { active: true },
  })
  assert.equal(status, 422)
  await vgCall('deletePerson', { personId: res.json.personId }, { token: staff })
})

// ---- village users cannot write volunteer roles (fixed by #56 — was RED finding #5) ----

test('PUT volunteer by a village user -> 403 (volunteer:write is federation-only)', async () => {
  const id = await makePerson('VCross')
  for (const token of [tokens.users.full_v1, tokens.users.full_v2]) {
    const res = await vgCall('putPersonVolunteer', { personId: id }, {
      token, body: { active: true },
    })
    if (res.status === 200) { // regression guard: undo
      await vgCall('deletePersonVolunteer', { personId: id }, { token: staff })
    }
    assert.equal(res.status, 403)
  }
})
