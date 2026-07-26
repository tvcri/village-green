import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'
import { villages, persons } from '../../setup/fixtures.js'

// Lifecycle / correctness for the current service-request model:
//  - status is DERIVED (deriveStatus): a volunteer makes it Confirmed, else Open
//  - notifications are OPT-IN via `notify` and recorded in notification_event
//  - schedule fields (serviceDate + the TIME columns) are wall-clock civil
//    strings (YYYY-MM-DD / HH:MM:SS), never instants — asserted as strings.
// Writes need sr:write, so the mutating caller is sc (Service Coordinator, the
// narrowest sr:write holder — pins that sr:write alone suffices).
const quahog = String(villages.quahog.id)
const member = String(persons.quahogMember.id)
const volunteer = String(persons.quahogVolunteer.id)

// Every request this file creates is deleted afterward — the seeded DB is
// shared with parallel test files.
const createdIds = []
after(async () => {
  for (const serviceRequestId of createdIds) {
    await vgCall('deleteServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  }
})

async function create (body) {
  const res = await vgCall('createServiceRequest', {}, { token: tokens.users.sc, body })
  if (res.json?.serviceRequestId) createdIds.push(res.json.serviceRequestId)
  return res
}

async function notificationEvents (serviceRequestId) {
  const [rows] = await withDb(c =>
    c.query('SELECT eventType FROM notification_event WHERE serviceRequestId = ?', [serviceRequestId]))
  return rows.map(r => r.eventType)
}

test('create returns 201, derives Open (no volunteer), and round-trips civil schedule fields', async () => {
  const body = {
    villageId: quahog,
    memberPersonId: member,
    serviceName: 'Ride to Arkham Hospital',
    serviceDate: '2026-08-01',
    startTime: '09:30:00',
    finishTime: '14:00:00',
  }
  const { status, json } = await create(body)
  assert.equal(status, 201)
  assert.equal(json.status, 'Open') // derived: no volunteer assigned
  assert.equal(json.villageId, quahog)
  assert.equal(json.memberPersonId, member)
  assert.equal(json.serviceName, 'Ride to Arkham Hospital')
  // Wall-clock round trip: the strings come back verbatim, no tz shift.
  assert.equal(json.serviceDate, '2026-08-01')
  assert.equal(json.startTime, '09:30:00')
  assert.equal(json.finishTime, '14:00:00')
})

test('notify=true records an open notification_event; omitting notify records none', async () => {
  const withNotify = await create({ villageId: quahog, memberPersonId: member, notify: true })
  assert.equal(withNotify.status, 201)
  assert.deepEqual(await notificationEvents(withNotify.json.serviceRequestId), ['open'])

  const withoutNotify = await create({ villageId: quahog, memberPersonId: member })
  assert.equal(withoutNotify.status, 201)
  assert.equal((await notificationEvents(withoutNotify.json.serviceRequestId)).length, 0)
})

test('assigning a volunteer via patch derives Confirmed status', async () => {
  const created = await create({ villageId: quahog, memberPersonId: member })
  assert.equal(created.status, 201)
  assert.equal(created.json.status, 'Open')

  const patched = await vgCall('patchServiceRequest', { serviceRequestId: created.json.serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: volunteer },
  })
  assert.equal(patched.status, 200)
  assert.equal(patched.json.status, 'Confirmed')
  assert.equal(patched.json.volunteerPersonId, volunteer)
})

test('cancelling via patch sets the cancelled status and records the event', async () => {
  // The PR #46 confirmation dialog is client-side; this is the underlying
  // transition it guards. Cancelled statuses pass deriveStatus through verbatim
  // (they are not re-derived to Open/Confirmed from the volunteer assignment).
  const created = await create({ villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer })
  assert.equal(created.status, 201)
  assert.equal(created.json.status, 'Confirmed')
  const id = created.json.serviceRequestId

  const cancelled = await vgCall('patchServiceRequest', { serviceRequestId: id }, {
    token: tokens.users.sc,
    body: { status: 'Member cancelled', notify: true },
  })
  assert.equal(cancelled.status, 200)
  assert.equal(cancelled.json.status, 'Member cancelled',
    'cancelled status sticks despite the assigned volunteer')
  assert.ok((await notificationEvents(id)).includes('cancelled'), 'cancelled notification recorded')

  const filtered = await vgCall('getServiceRequests', { status: ['cancelled'] }, {
    token: tokens.users.sc, // federation read: no villageId filter needed
  })
  assert.ok(filtered.json.map(r => r.serviceRequestId).includes(id),
    'the cancelled filter maps to all three cancelled db statuses')
})

test('status query filter maps to db statuses', async () => {
  const open = await create({ villageId: quahog, memberPersonId: member })
  const confirmed = await create({ villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer })
  assert.equal(open.json.status, 'Open')
  assert.equal(confirmed.json.status, 'Confirmed')

  const { status, json } = await vgCall('getServiceRequests', { status: ['confirmed'] }, {
    token: tokens.users.sc,
  })
  assert.equal(status, 200)
  const ids = json.map(r => r.serviceRequestId)
  assert.ok(ids.includes(confirmed.json.serviceRequestId), 'confirmed filter includes the Confirmed request')
  assert.ok(!ids.includes(open.json.serviceRequestId), 'confirmed filter excludes the Open request')
})
