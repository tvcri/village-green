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
// No second Quahog volunteer fixture exists; vssHouseholdSibling (id 7) is an
// active volunteer in a different village, which is all rule 1's exemption
// test needs: a volunteer id different from `volunteer`.
const otherVolunteer = String(persons.vssHouseholdSibling.id)

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
  const withNotify = await create({ villageId: quahog, memberPersonId: member, notify: true, serviceDate: '2026-08-01' })
  assert.equal(withNotify.status, 201)
  assert.deepEqual(await notificationEvents(withNotify.json.serviceRequestId), ['open'])

  const withoutNotify = await create({ villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01' })
  assert.equal(withoutNotify.status, 201)
  assert.equal((await notificationEvents(withoutNotify.json.serviceRequestId)).length, 0)
})

test('assigning a volunteer via patch derives Confirmed status', async () => {
  const created = await create({ villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01' })
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
  // serviceDate is set because the list assertion below filters by date range.
  const created = await create({ villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer, serviceDate: '2026-08-01' })
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

  // serviceDateStart is required; '2000-01-01' is wide enough to catch
  // runtime-created requests whatever date they land on.
  const filtered = await vgCall('getServiceRequests', { status: ['cancelled'], serviceDateStart: '2000-01-01' }, {
    token: tokens.users.sc, // federation read: no villageId filter needed
  })
  assert.ok(filtered.json.map(r => r.serviceRequestId).includes(id),
    'the cancelled filter maps to all three cancelled db statuses')
})

test('status query filter maps to db statuses', async () => {
  // Both carry serviceDate so the exclusion below proves the STATUS filter
  // fired, not the date window.
  const open = await create({ villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01' })
  const confirmed = await create({ villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer, serviceDate: '2026-08-01' })
  assert.equal(open.json.status, 'Open')
  assert.equal(confirmed.json.status, 'Confirmed')

  const { status, json } = await vgCall('getServiceRequests', { status: ['confirmed'], serviceDateStart: '2000-01-01' }, {
    token: tokens.users.sc,
  })
  assert.equal(status, 200)
  const ids = json.map(r => r.serviceRequestId)
  assert.ok(ids.includes(confirmed.json.serviceRequestId), 'confirmed filter includes the Confirmed request')
  assert.ok(!ids.includes(open.json.serviceRequestId), 'confirmed filter excludes the Open request')
})

test('rule 2: a cancelled request cannot be moved back to Open or Confirmed', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId

  const cancelled = await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Member cancelled' } })
  assert.equal(cancelled.status, 200)
  assert.equal(cancelled.json.status, 'Member cancelled')

  // 'Open' is not in the Patch enum, so express-openapi-validator rejects it
  // at the spec boundary with a 400 before the service is reached. Assert the
  // rejection, not the specific code: if the enum ever widens, the service
  // layer must still refuse the transition.
  const back = await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Open' } })
  assert.ok(back.status >= 400, `expected rejection, got ${back.status}`)

  const after = await vgCall('getServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  assert.equal(after.json.status, 'Member cancelled')
})

test('rule 2: terminal to terminal is allowed, and rewrites the reason verbatim', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId

  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Member cancelled' } })

  const changed = await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Hub cancelled' } })
  assert.equal(changed.status, 200)
  assert.equal(changed.json.status, 'Hub cancelled')
})

test('rule 1: changing the volunteer on a cancelled request without a status is refused', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Member cancelled' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { volunteerPersonId: volunteer } })
  assert.equal(res.status, 422)

  const after = await vgCall('getServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  assert.equal(after.json.status, 'Member cancelled')
  assert.equal(after.json.volunteerPersonId, null)
})

test('rule 1: changing the volunteer on an Unmatched request without a status is refused', async () => {
  // Unmatched is an end state the API itself never accepts on PATCH — the
  // nightly MySQL event evt_auto_complete_service_requests writes it, and
  // production has such rows. It is therefore unreachable through the API and
  // must be seeded directly. This is the one end state in rule 1's scope with
  // no other coverage, and it is the shape the Vue edit form actually sends on
  // such a row: volunteerPersonId with no status at all.
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await withDb(c =>
    c.query('UPDATE service_request SET status = ? WHERE id = ?', ['Unmatched', serviceRequestId]))

  const res = await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { volunteerPersonId: volunteer } })
  assert.equal(res.status, 422)

  const after = await vgCall('getServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  assert.equal(after.json.status, 'Unmatched', 'the refused patch must leave the row untouched')
  assert.equal(after.json.volunteerPersonId, null)
})

test('rule 1: re-sending the SAME volunteer on a cancelled request is a no-op, not a 422', async () => {
  // This is the ordinary-Save case. handleSubmit always includes
  // volunteerPersonId, so a rule keyed on the key's presence rather than a
  // change of value would break every save on a cancelled request.
  const { json } = await create({
    villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer,
    serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  assert.equal(json.status, 'Confirmed')

  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Volunteer cancelled' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: volunteer, serviceName: 'Errand', status: 'Volunteer cancelled' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'Volunteer cancelled')
  assert.equal(res.json.serviceName, 'Errand')
})

test('rule 1: null-to-null on a cancelled request is not a change', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Hub cancelled' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: null, status: 'Hub cancelled' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'Hub cancelled')
})

test('rule 1: changing the volunteer alongside a cancel reason is refused', async () => {
  // The droplist form sends volunteerPersonId on every save, so a cancelled
  // row can be re-cancelled under a different reason with a NEW volunteer in
  // one write. Only Completed is exempt from rule 1 — not every end state.
  const { json } = await create({
    villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer,
    serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Hub cancelled' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: otherVolunteer, status: 'Member cancelled' }
  })
  assert.equal(res.status, 422)

  const after = await vgCall('getServiceRequest', { serviceRequestId },
    { token: tokens.users.sc })
  assert.equal(String(after.json.volunteerPersonId), volunteer)
  assert.equal(after.json.status, 'Hub cancelled')
})

test('rule 1: Completed is exempt — the volunteer may be corrected', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer,
    serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Completed' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: otherVolunteer, status: 'Completed' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'Completed')
  assert.equal(String(res.json.volunteerPersonId), otherVolunteer)
})

test('rule 1: the feature write path — volunteer plus Completed on a cancelled row', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Member cancelled' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: volunteer, status: 'Completed' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'Completed')
  assert.equal(String(res.json.volunteerPersonId), volunteer)
})

test('rule 3: completing a request with no volunteer is refused', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  assert.equal(json.status, 'Open')

  const res = await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Completed' } })
  assert.equal(res.status, 422)

  const after = await vgCall('getServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  assert.equal(after.json.status, 'Open')
})

test('rule 3: clearing the volunteer on a Completed request is refused', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer,
    serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Completed' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: null, status: 'Completed' }
  })
  assert.equal(res.status, 422)

  const after = await vgCall('getServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  assert.equal(String(after.json.volunteerPersonId), volunteer)
})

test('rule 3: judges the resulting row, so volunteer plus Completed together is fine', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: volunteer, status: 'Completed' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'Completed')
})

test('notify on an Unmatched request is refused — Unmatched has no notification_event surface, changed or not', async () => {
  // Unmatched is unreachable through the API (see the rule-1 Unmatched test
  // above for why) and must be seeded directly. notification_event.eventType
  // has no value for Unmatched, so notify: true must 422 regardless of
  // whether the status itself changed.
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await withDb(c =>
    c.query('UPDATE service_request SET status = ? WHERE id = ?', ['Unmatched', serviceRequestId]))

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { description: 'x', notify: true }
  })
  assert.equal(res.status, 422)
  assert.match(res.json.detail, /Unmatched/)
  assert.equal((await notificationEvents(serviceRequestId)).length, 0, 'no notification_event row inserted')

  const after = await vgCall('getServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  assert.equal(after.json.status, 'Unmatched')
})

test('the same patch without notify succeeds and updates the description', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await withDb(c =>
    c.query('UPDATE service_request SET status = ? WHERE id = ?', ['Unmatched', serviceRequestId]))

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { description: 'x' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.description, 'x')
  assert.equal(res.json.status, 'Unmatched')
  assert.equal((await notificationEvents(serviceRequestId)).length, 0)
})

test('notify on a patch resulting in Completed is refused — Completed has no notification_event surface', async () => {
  // The OAS itself rejects { status: 'Completed', notify: true } as a direct
  // pair (ServiceRequestPatch's `not/required` guard, village-green.yaml
  // ~4238), so the service-layer refusal is reached the other way: a row
  // already Completed, patched again with notify: true and no `status` key.
  // The terminal short-circuit resolves status to current.status ('Completed')
  // and this must still 422 — it is the case writeNotificationEvent has
  // always refused.
  const { json } = await create({
    villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  const completed = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { status: 'Completed' }
  })
  assert.equal(completed.status, 200)
  assert.equal(completed.json.status, 'Completed')

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { description: 'x', notify: true }
  })
  assert.equal(res.status, 422)
  assert.match(res.json.detail, /Completed/)
  assert.equal((await notificationEvents(serviceRequestId)).length, 0, 'no notification_event row inserted')

  const after = await vgCall('getServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  assert.equal(after.json.status, 'Completed')
  assert.notEqual(after.json.description, 'x', 'the failed notify must not leave the description update applied either')
})

test('notify on a patch that genuinely changes status still writes the correct event', async () => {
  const { json } = await create({ villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01' })
  const serviceRequestId = json.serviceRequestId
  assert.equal(json.status, 'Open')

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: volunteer, notify: true }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'Confirmed')
  assert.deepEqual(await notificationEvents(serviceRequestId), ['confirmed'])
})

test('resending a notification on an unchanged Open request succeeds — the NotificationHistoryDialog resend path', async () => {
  // Mirrors exactly what NotificationHistoryDialog.vue's Send/Resend button
  // PATCHes: { notify: true } alone, on a row whose status is already Open
  // and does not change. Re-broadcasting an Open request to drum up
  // volunteer signups is the deliberate feature this guards.
  const { json } = await create({ villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01' })
  const serviceRequestId = json.serviceRequestId
  assert.equal(json.status, 'Open')

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { notify: true }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'Open')
  assert.deepEqual(await notificationEvents(serviceRequestId), ['open'])
})

test('a single-field patch on a terminal request leaves its status alone', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer,
    serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Completed' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { serviceName: 'Errand' } })
  assert.equal(res.status, 200)
  assert.equal(res.json.serviceName, 'Errand')
  assert.equal(res.json.status, 'Completed', 'omitting status must not re-derive a terminal row')
})
