import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'
import { villages, persons } from '../../setup/fixtures.js'

// The VSS (volunteer self-service) surface: /volunteer-requests/**.
//
// Access here is IDENTITY-derived, not grant-derived: requireVolunteerAccess
// resolves personIds by matching user_data.username against person.email
// through active_volunteer, and 403s an empty set. /volunteer-requests is in
// STAFF_GATE_EXEMPT_PREFIXES, so a volunteer needs no role grant at all — and
// conversely no amount of staff/admin grant gets a non-volunteer in.
//
// `vssJoe` is the only fixture user whose username matches a person email. It
// matches TWO active volunteer persons (quahogVolunteer + vssHouseholdSibling,
// same email by design), so it is also the multi-volunteer household from #68.
// Every canonical user (@quahog.test, @federation.test, ...) resolves to [].
//
// Capability boundary: capability name maps to a serviceName PREFIX ('Rides' ->
// 'Ride:'). The household holds Rides and NOT Errands, so an 'Errand: ...'
// request must stay invisible. Note the seeded fixture SRs are named 'Ride to
// pharmacy' — no colon — so they match nothing; requests here are created with
// real prefixes.
//
// Pure decision logic (outcome classification, gate SQL shape) is unit-tested
// upstream in api/source/test/{volunteerRequestService,userServiceVss,accessGates}.test.js.
// This file covers the HTTP contract, the gates in middleware order, and the
// atomic first-wins UPDATE.

const vssJoe = tokens.users.vssJoe
const quahogPerson = String(persons.quahogVolunteer.id)
const siblingPerson = String(persons.vssHouseholdSibling.id)

// Sign-up/release MUTATE service_request, so this file never touches the
// canonical fixtures — every request is created (as sc) and deleted after.
const createdIds = []
after(async () => {
  for (const serviceRequestId of createdIds) {
    await vgCall('deleteServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  }
})

async function openRequest ({ serviceName = 'Ride: Medical appointment', villageId = villages.quahog.id } = {}) {
  const { status, json } = await vgCall('createServiceRequest', {}, {
    token: tokens.users.sc,
    body: {
      villageId: String(villageId),
      memberPersonId: String(villageId === villages.quahog.id ? persons.quahogMember.id : persons.innsmouthMember.id),
      serviceName,
      destination: 'Somewhere',
      serviceDate: '2026-08-01',
    },
  })
  assert.equal(status, 201, 'fixture request created')
  createdIds.push(json.serviceRequestId)
  return String(json.serviceRequestId)
}

async function statusOf (serviceRequestId) {
  const [rows] = await withDb(c =>
    c.query('SELECT status, volunteerPersonId FROM service_request WHERE id = ?', [serviceRequestId]))
  return rows[0]
}

async function eventTypes (serviceRequestId) {
  const [rows] = await withDb(c =>
    c.query('SELECT eventType FROM notification_event WHERE serviceRequestId = ?', [serviceRequestId]))
  return rows.map(r => r.eventType)
}

// ---- the access gate (GREEN — identity, not grants) ----

test('GET /volunteer-requests with no token -> 401', async () => {
  const { status } = await vgCall('getVolunteerRequests', { scope: 'open' })
  assert.equal(status, 401)
})

test('every canonical (email-unmatched) user -> 403 on the whole VSS surface', async () => {
  // Literal URLs: a spec rename must not silently retarget this boundary check.
  // staff/admin included on purpose — grants do not substitute for identity.
  for (const handle of ['full_v1', 'staff', 'admin', 'sc', 'nogrants']) {
    for (const path of ['/volunteer-requests?scope=open', '/volunteer-requests/villages', '/volunteer-requests/1']) {
      const { status } = await vgFetch(path, { token: tokens.users[handle] })
      assert.equal(status, 403, `${handle} -> ${path}`)
    }
  }
})

test('vssJoe reaches VSS with ZERO role grants (staff gate exempts the prefix)', async () => {
  const { status } = await vgCall('getVolunteerRequests', { scope: 'open' }, { token: vssJoe })
  assert.equal(status, 200)
})

test('GET /user populates volunteers[] for vssJoe (canonical users get [])', async () => {
  const { status, json } = await vgCall('getUser', {}, { token: vssJoe })
  assert.equal(status, 200)
  const ids = json.volunteers.map(v => String(v.personId)).sort()
  assert.deepEqual(ids, [quahogPerson, siblingPerson].sort(),
    'both household volunteers resolve from the shared email')
})

// ---- scope=open + the capability prefix boundary (GREEN) ----

test('scope=open surfaces a held-capability request and hides an unheld one', async () => {
  const ride = await openRequest({ serviceName: 'Ride: Medical appointment' })
  const errand = await openRequest({ serviceName: 'Errand: Grocery pickup' })

  const { status, json } = await vgCall('getVolunteerRequests', { scope: 'open' }, { token: vssJoe })
  assert.equal(status, 200)
  const ids = json.map(r => String(r.serviceRequestId))
  assert.ok(ids.includes(ride), 'Rides capability matches the "Ride:" prefix')
  assert.ok(!ids.includes(errand), 'no Errands capability -> "Errand:" stays invisible')
})

test('scope=open is cross-village by design (any active volunteer, any village)', async () => {
  const innsmouth = await openRequest({ serviceName: 'Ride: Harbor clinic', villageId: villages.innsmouth.id })
  const { json } = await vgCall('getVolunteerRequests', { scope: 'open' }, { token: vssJoe })
  assert.ok(json.map(r => String(r.serviceRequestId)).includes(innsmouth))
})

test('scope=open omits the volunteer-only columns', async () => {
  await openRequest()
  const { json } = await vgCall('getVolunteerRequests', { scope: 'open' }, { token: vssJoe })
  const row = json[0]
  assert.ok(row, 'at least one open request')
  for (const field of ['emergencyContact', 'volunteerAddress', 'volunteerPersonId']) {
    assert.ok(!(field in row), `scope=open must not carry ${field}`)
  }
})

// ---- sign-up (GREEN) ----

test('sign-up on a capability-mismatched request -> 404 (no existence leak)', async () => {
  const errand = await openRequest({ serviceName: 'Errand: Grocery pickup' })
  const { status } = await vgCall('signUpVolunteerRequest', { serviceRequestId: errand }, { token: vssJoe })
  assert.equal(status, 404, 'indistinguishable from a missing row')
  assert.equal((await statusOf(errand)).status, 'Open', 'and the row is untouched')
})

test('sign-up with a 2-qualifier household and no personId -> 422 selectionRequired', async () => {
  const id = await openRequest()
  const { status, json } = await vgCall('signUpVolunteerRequest', { serviceRequestId: id }, { token: vssJoe })
  assert.equal(status, 422)
  // Error envelope is { error, code, detail } — the reason rides in detail.
  assert.equal(json.detail.reason, 'selectionRequired')
  assert.equal((await statusOf(id)).status, 'Open', 'no commitment on a 422')
})

test('sign-up with a posted personId outside the caller\'s set -> 403', async () => {
  const id = await openRequest()
  const { status } = await vgCall('signUpVolunteerRequest', { serviceRequestId: id }, {
    token: vssJoe,
    body: { personId: String(persons.miskatonicVolunteer.id) },
  })
  assert.equal(status, 403, 'rejected before the service call')
  assert.equal((await statusOf(id)).status, 'Open')
})

test('sign-up with a chosen personId -> 200 Confirmed + a Confirmed notification', async () => {
  const id = await openRequest()
  const { status, json } = await vgCall('signUpVolunteerRequest', { serviceRequestId: id }, {
    token: vssJoe, body: { personId: quahogPerson },
  })
  assert.equal(status, 200)
  assert.equal(String(json.serviceRequestId), id, 'read-back after commit, never a null body')

  const row = await statusOf(id)
  assert.equal(row.status, 'Confirmed')
  assert.equal(String(row.volunteerPersonId), quahogPerson, 'the CHOSEN volunteer, not the other sibling')
  // writeNotificationEvent maps status -> a LOWERCASE eventType.
  assert.ok((await eventTypes(id)).includes('confirmed'))
})

test('re-posting the same personId is idempotent -> 200 alreadyOwn', async () => {
  const id = await openRequest()
  for (const _ of [1, 2]) {
    const { status } = await vgCall('signUpVolunteerRequest', { serviceRequestId: id }, {
      token: vssJoe, body: { personId: quahogPerson },
    })
    assert.equal(status, 200, 'a retry after a lost response must not dead-end')
  }
  assert.equal(String((await statusOf(id)).volunteerPersonId), quahogPerson)
})

test('the sibling signing up for a request this account already owns -> 409 alreadyOwnAccount', async () => {
  const id = await openRequest()
  await vgCall('signUpVolunteerRequest', { serviceRequestId: id }, {
    token: vssJoe, body: { personId: quahogPerson },
  })
  const { status, json } = await vgCall('signUpVolunteerRequest', { serviceRequestId: id }, {
    token: vssJoe, body: { personId: siblingPerson },
  })
  assert.equal(status, 409)
  assert.equal(json.detail.reason, 'alreadyOwnAccount')
  assert.equal(String(json.detail.volunteerPersonId), quahogPerson, 'names the committed sibling')
})

test('sign-up on a request confirmed by a STRANGER -> 409 conflict, naming nobody', async () => {
  const id = await openRequest()
  // Commit it to a volunteer outside the household, via the staff write path.
  const { status } = await vgCall('patchServiceRequest', { serviceRequestId: id }, {
    token: tokens.users.sc, body: { volunteerPersonId: String(persons.miskatonicVolunteer.id) },
  })
  assert.equal(status, 200, 'precondition: committed to a stranger')

  const res = await vgCall('signUpVolunteerRequest', { serviceRequestId: id }, {
    token: vssJoe, body: { personId: quahogPerson },
  })
  assert.equal(res.status, 409)
  // The plain-conflict detail is a bare STRING ("Service request is not open
  // for sign-up."), where alreadyOwnAccount's is an object carrying the owner.
  // Assert on the serialized body so either shape is covered: a stranger's
  // personId must appear nowhere in the response.
  assert.notEqual(res.json.detail?.reason, 'alreadyOwnAccount')
  assert.ok(!JSON.stringify(res.json).includes(String(persons.miskatonicVolunteer.id)),
    "must not carry a stranger's id")
})

// ---- scope=mine / history (GREEN) ----

test('scope=mine is account-wide and carries the volunteer-only columns', async () => {
  const id = await openRequest()
  await vgCall('signUpVolunteerRequest', { serviceRequestId: id }, {
    token: vssJoe, body: { personId: siblingPerson },
  })

  const { status, json } = await vgCall('getVolunteerRequests', { scope: 'mine' }, { token: vssJoe })
  assert.equal(status, 200)
  const row = json.find(r => String(r.serviceRequestId) === id)
  assert.ok(row, "the sibling's commitment appears on the shared account")
  assert.ok('volunteerAddress' in row, 'mine carries volunteerAddress')
  assert.equal(String(row.volunteerPersonId), siblingPerson)
})

// ---- release (GREEN — account-wide) ----

test('either household member can release the other\'s commitment; row returns to Open', async () => {
  const id = await openRequest()
  await vgCall('signUpVolunteerRequest', { serviceRequestId: id }, {
    token: vssJoe, body: { personId: quahogPerson },
  })

  const { status } = await vgCall('releaseVolunteerRequest', { serviceRequestId: id }, { token: vssJoe })
  assert.equal(status, 200)

  const row = await statusOf(id)
  assert.equal(row.status, 'Open')
  assert.equal(row.volunteerPersonId, null)
  assert.ok((await eventTypes(id)).includes('open'), 're-broadcast to the volunteer list')
})

test('releasing a request the account does not own -> 409', async () => {
  const id = await openRequest()
  const { status } = await vgCall('releaseVolunteerRequest', { serviceRequestId: id }, { token: vssJoe })
  assert.equal(status, 409, 'Open, so not this account\'s confirmed request')
})

// ---- single GET (GREEN) ----

test('GET one: visible while Open via capability, and still visible once owned', async () => {
  const id = await openRequest()
  const before = await vgCall('getVolunteerRequest', { serviceRequestId: id }, { token: vssJoe })
  assert.equal(before.status, 200, 'Open + capability match')

  await vgCall('signUpVolunteerRequest', { serviceRequestId: id }, {
    token: vssJoe, body: { personId: quahogPerson },
  })
  const after = await vgCall('getVolunteerRequest', { serviceRequestId: id }, { token: vssJoe })
  assert.equal(after.status, 200, 'ownership keeps it visible after it leaves Open')
})

test('GET one on a capability-mismatched request -> 404', async () => {
  const errand = await openRequest({ serviceName: 'Errand: Grocery pickup' })
  const { status } = await vgCall('getVolunteerRequest', { serviceRequestId: errand }, { token: vssJoe })
  assert.equal(status, 404)
})
