import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../lib/client.js'
import { tokens } from '../lib/context.js'
import { withDb } from '../lib/db.js'
import { villages, persons } from '../setup/fixtures.js'

const SR = '/service-requests'
const quahog = String(villages.quahog.id)
const member = String(persons.quahogMember.id)
const volunteer = String(persons.quahogVolunteer.id)

async function emailEvents (serviceRequestId) {
  const [rows] = await withDb(c =>
    c.query('SELECT event_type FROM email_event WHERE service_request_id = ?', [serviceRequestId]))
  return rows.map(r => r.event_type)
}

test('create returns 201 with Open status and round-trips fields', async () => {
  const body = {
    villageId: quahog,
    status: 'Open',
    memberPersonId: member,
    serviceName: 'Ride to Arkham Sanitarium',
    finishAt: '2026-07-20T14:00:00Z',
  }
  const { status, json } = await vgFetch(SR, { token: tokens.users.full_v1, body })
  assert.equal(status, 201)
  assert.equal(json.status, 'Open')
  assert.equal(json.villageId, quahog)
  assert.equal(json.memberPersonId, member)
  assert.equal(json.serviceName, 'Ride to Arkham Sanitarium')
  assert.equal(json.finishAt, '2026-07-20T14:00:00Z') // ISO-Z round trip
})

test('assigning a volunteer transitions status and emits exactly one patch email_event', async () => {
  // create (no volunteer)
  const created = await vgFetch(SR, {
    token: tokens.users.full_v1,
    body: { villageId: quahog, status: 'Open', memberPersonId: member, serviceName: 'Grocery run' },
  })
  assert.equal(created.status, 201)
  const id = created.json.serviceRequestId
  assert.deepEqual(await emailEvents(id), ['new_request'])

  // patch: assign volunteer + confirm
  const patched = await vgFetch(`/service-requests/${id}`, {
    token: tokens.users.full_v1,
    method: 'PATCH',
    body: { volunteerPersonId: volunteer, status: 'Confirmed' },
  })
  assert.equal(patched.status, 200)
  assert.equal(patched.json.status, 'Confirmed')
  assert.equal(patched.json.volunteerPersonId, volunteer)
  assert.equal((await emailEvents(id)).filter(e => e === 'patch_request').length, 1)

  // re-patch with the SAME volunteer: no duplicate email_event
  const repatched = await vgFetch(`/service-requests/${id}`, {
    token: tokens.users.full_v1,
    method: 'PATCH',
    body: { volunteerPersonId: volunteer },
  })
  assert.equal(repatched.status, 200)
  assert.equal((await emailEvents(id)).filter(e => e === 'patch_request').length, 1)
})

test('status query filter maps to db statuses', async () => {
  const mk = async (status) => {
    const r = await vgFetch(SR, {
      token: tokens.users.full_v1,
      body: { villageId: quahog, status, serviceName: `status-${status}` },
    })
    assert.equal(r.status, 201)
    return r.json.serviceRequestId
  }
  const openId = await mk('Open')
  const completedId = await mk('Completed')

  const { status, json } = await vgFetch(SR, {
    token: tokens.users.full_v1,
    query: { status: ['completed'] },
  })
  assert.equal(status, 200)
  const ids = json.map(r => r.serviceRequestId)
  assert.ok(ids.includes(completedId), 'completed filter should include the Completed request')
  assert.ok(!ids.includes(openId), 'completed filter should exclude the Open request')
})
