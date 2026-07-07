import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'
import { villages, persons } from '../../setup/fixtures.js'

// Lifecycle / correctness for the current service-request model:
//  - status is DERIVED (deriveStatus): a volunteer makes it Confirmed, else Open
//  - notifications are OPT-IN via `notify` and recorded in notification_event
const SR = '/service-requests'
const quahog = String(villages.quahog.id)
const member = String(persons.quahogMember.id)
const volunteer = String(persons.quahogVolunteer.id)

async function notificationEvents (serviceRequestId) {
  const [rows] = await withDb(c =>
    c.query('SELECT eventType FROM notification_event WHERE serviceRequestId = ?', [serviceRequestId]))
  return rows.map(r => r.eventType)
}

test('create returns 201, derives Open (no volunteer), and round-trips fields', async () => {
  const body = {
    villageId: quahog,
    memberPersonId: member,
    serviceName: 'Ride to Arkham Hospital',
    finishAt: '2026-07-20T14:00:00Z',
  }
  const { status, json } = await vgFetch(SR, { token: tokens.users.full_v1, body })
  assert.equal(status, 201)
  assert.equal(json.status, 'Open') // derived: no volunteer assigned
  assert.equal(json.villageId, quahog)
  assert.equal(json.memberPersonId, member)
  assert.equal(json.serviceName, 'Ride to Arkham Hospital')
  assert.equal(json.finishAt, '2026-07-20T14:00:00Z') // ISO-Z round trip
})

test('notify=true records an open notification_event; omitting notify records none', async () => {
  const withNotify = await vgFetch(SR, {
    token: tokens.users.full_v1,
    body: { villageId: quahog, memberPersonId: member, notify: true },
  })
  assert.equal(withNotify.status, 201)
  assert.deepEqual(await notificationEvents(withNotify.json.serviceRequestId), ['open'])

  const withoutNotify = await vgFetch(SR, {
    token: tokens.users.full_v1,
    body: { villageId: quahog, memberPersonId: member },
  })
  assert.equal(withoutNotify.status, 201)
  assert.equal((await notificationEvents(withoutNotify.json.serviceRequestId)).length, 0)
})

test('assigning a volunteer via patch derives Confirmed status', async () => {
  const created = await vgFetch(SR, {
    token: tokens.users.full_v1,
    body: { villageId: quahog, memberPersonId: member },
  })
  assert.equal(created.status, 201)
  assert.equal(created.json.status, 'Open')

  const patched = await vgFetch(`/service-requests/${created.json.serviceRequestId}`, {
    token: tokens.users.full_v1,
    method: 'PATCH',
    body: { volunteerPersonId: volunteer },
  })
  assert.equal(patched.status, 200)
  assert.equal(patched.json.status, 'Confirmed')
  assert.equal(patched.json.volunteerPersonId, volunteer)
})

test('status query filter maps to db statuses', async () => {
  const open = await vgFetch(SR, {
    token: tokens.users.full_v1,
    body: { villageId: quahog, memberPersonId: member },
  })
  const confirmed = await vgFetch(SR, {
    token: tokens.users.full_v1,
    body: { villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer },
  })
  assert.equal(open.json.status, 'Open')
  assert.equal(confirmed.json.status, 'Confirmed')

  const { status, json } = await vgFetch(SR, {
    token: tokens.users.full_v1,
    query: { status: ['confirmed'] },
  })
  assert.equal(status, 200)
  const ids = json.map(r => r.serviceRequestId)
  assert.ok(ids.includes(confirmed.json.serviceRequestId), 'confirmed filter includes the Confirmed request')
  assert.ok(!ids.includes(open.json.serviceRequestId), 'confirmed filter excludes the Open request')
})
