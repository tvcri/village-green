import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { withDb } from '../../lib/db.js'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { serviceRequests as sr, villages, persons } from '../../setup/fixtures.js'
import { auditRows } from '../audit/lib.js'

// The harness scaffold marks 0032 executed, so its backfill never sees fixture
// rows; seed.js inserts the child rows the backfill would have. These pin that
// seeded state (and the shape of the table), not the migration's SQL: the
// backfill itself is proven against a production dump.

const destinationsOf = (id) => withDb(async (conn) => {
  const [rows] = await conn.query(
    `SELECT destination, address, city, state, zip, phone
     FROM service_request_destination WHERE serviceRequestId = ? ORDER BY id`, [id])
  return rows
})

test('backfill: a fixture ride has one destination row matching its flat columns', async () => {
  const rows = await destinationsOf(sr.srM1.id)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].destination, sr.srM1.destination)
  assert.ok(sr.srM1.destination, 'fixture has a destination to match')
})

test('backfill: a Tech Support fixture has no destination rows', async () => {
  assert.equal(sr.srM7.serviceName, 'Tech Support')
  assert.deepEqual(await destinationsOf(sr.srM7.id), [])
})

// ---- API contract: destinations[] on read and write ----

const quahog = String(villages.quahog.id)
const member = String(persons.quahogMember.id)

const createdIds = []
after(async () => {
  for (const serviceRequestId of createdIds) {
    await vgCall('deleteServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  }
})

const base = (extra) => ({
  villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01',
  serviceName: 'Errand: Grocery pickup', ...extra,
})

async function create (extra) {
  const res = await vgCall('createServiceRequest', {}, { token: tokens.users.sc, body: base(extra) })
  if (res.json?.serviceRequestId) createdIds.push(res.json.serviceRequestId)
  return res
}

const patch = (serviceRequestId, body) =>
  vgCall('patchServiceRequest', { serviceRequestId }, { token: tokens.users.sc, body })

const flatOf = (id) => withDb(async (conn) => {
  const [rows] = await conn.query(
    'SELECT destination, address, city, state, zip, phone FROM service_request WHERE id = ?', [id])
  return rows[0]
})

const clinic = { destination: 'Clinic', address: '1 Main St', city: 'Wakefield', state: 'RI', zip: '02879', phone: '401-555-0100' }
const pharmacy = { destination: 'Pharmacy', address: null, city: 'Peace Dale', state: null, zip: null, phone: null }

test('POST stores two destinations and GET returns them in order, without ids', async () => {
  const { status, json } = await create({ destinations: [clinic, { destination: 'Pharmacy', city: 'Peace Dale' }] })
  assert.equal(status, 201)
  assert.deepEqual(json.destinations, [clinic, pharmacy])
  const got = await vgCall('getServiceRequest', { serviceRequestId: json.serviceRequestId }, { token: tokens.users.sc })
  assert.equal(got.status, 200)
  assert.deepEqual(got.json.destinations, [clinic, pharmacy])
  assert.ok(got.json.destinations.every(d => !('id' in d)))
})

test('POST writes the first destination to the flat columns', async () => {
  const { json } = await create({ destinations: [clinic, pharmacy] })
  assert.deepEqual(await flatOf(json.serviceRequestId), clinic)
})

test('PATCH with a new list replaces it; removing the first destination moves the second into the flat columns and first place', async () => {
  const { json } = await create({ destinations: [clinic, pharmacy] })
  const id = json.serviceRequestId
  const replaced = await patch(id, { destinations: [{ destination: 'Library' }, { destination: 'Bank' }, pharmacy] })
  assert.equal(replaced.status, 200)
  assert.deepEqual(replaced.json.destinations.map(d => d.destination), ['Library', 'Bank', 'Pharmacy'])
  const removed = await patch(id, { destinations: [{ destination: 'Bank' }, pharmacy] })
  assert.deepEqual(removed.json.destinations.map(d => d.destination), ['Bank', 'Pharmacy'])
  assert.equal((await flatOf(id)).destination, 'Bank')
  assert.equal((await destinationsOf(id)).length, 2)
})

test('PATCH with destinations [] on an Errand removes all rows and nulls the flat columns', async () => {
  const { json } = await create({ destinations: [clinic] })
  const id = json.serviceRequestId
  const res = await patch(id, { destinations: [] })
  assert.equal(res.status, 200)
  assert.deepEqual(res.json.destinations, [])
  assert.deepEqual(await destinationsOf(id), [])
  assert.deepEqual(await flatOf(id), { destination: null, address: null, city: null, state: null, zip: null, phone: null })
})

test('PATCH omitting destinations leaves rows and flat columns unchanged', async () => {
  const { json } = await create({ destinations: [clinic, pharmacy] })
  const id = json.serviceRequestId
  const res = await patch(id, { status: 'Member cancelled' })
  assert.equal(res.status, 200)
  assert.deepEqual(res.json.destinations, [clinic, pharmacy])
  assert.deepEqual(await flatOf(id), clinic)
  assert.equal((await destinationsOf(id)).length, 2)
})

test('VSS signup leaves destinations unchanged', async () => {
  const { json } = await create({ serviceName: 'Ride: Medical appointment', destinations: [clinic, pharmacy] })
  const id = String(json.serviceRequestId)
  const signUp = await vgCall('signUpVolunteerRequest', { serviceRequestId: id }, {
    token: tokens.users.vssJoe, body: { personId: String(persons.quahogVolunteer.id) },
  })
  assert.equal(signUp.status, 200)
  assert.deepEqual((await destinationsOf(id)).map(d => d.destination), ['Clinic', 'Pharmacy'])
  assert.deepEqual(await flatOf(id), clinic)
})

test('POST a Ride with no destinations returns 422', async () => {
  assert.equal((await create({ serviceName: 'Ride: Medical appointment' })).status, 422)
  assert.equal((await create({ serviceName: 'Ride: Medical appointment', destinations: [] })).status, 422)
})

test('PATCH a Ride with destinations [] returns 422', async () => {
  const { json } = await create({ serviceName: 'Ride: Medical appointment', destinations: [clinic] })
  const id = json.serviceRequestId
  assert.equal((await patch(id, { destinations: [] })).status, 422)
  assert.deepEqual((await destinationsOf(id)).map(d => d.destination), ['Clinic'])
  // The rule judges the serviceName the request will have after the patch.
  const toErrand = await patch(id, { serviceName: 'Errand: Grocery pickup', destinations: [] })
  assert.equal(toErrand.status, 200)
})

test('POST an Errand with no destinations succeeds', async () => {
  const { status, json } = await create({})
  assert.equal(status, 201)
  assert.deepEqual(json.destinations, [])
})

test('a destination with an empty name returns 400', async () => {
  assert.equal((await create({ destinations: [{ destination: '' }] })).status, 400)
  assert.equal((await create({ destinations: [{ address: '1 Main St' }] })).status, 400)
  const { json } = await create({})
  assert.equal((await patch(json.serviceRequestId, { destinations: [{ destination: '' }] })).status, 400)
})

test('the flat destination field is rejected on POST and PATCH', async () => {
  assert.equal((await create({ destination: 'Clinic' })).status, 400)
  const { json } = await create({})
  assert.equal((await patch(json.serviceRequestId, { destination: 'Clinic' })).status, 400)
  assert.equal((await patch(json.serviceRequestId, { city: 'Wakefield' })).status, 400)
})

test('GET list, GET by id and the VSS list and detail all carry destinations', async () => {
  const { json } = await create({ serviceName: 'Ride: Medical appointment', destinations: [clinic, pharmacy] })
  const id = String(json.serviceRequestId)
  const list = await vgCall('getServiceRequests', { serviceDateStart: '2026-08-01', serviceDateEnd: '2026-08-01' }, { token: tokens.users.sc })
  assert.equal(list.status, 200)
  assert.deepEqual(list.json.find(r => String(r.serviceRequestId) === id).destinations, [clinic, pharmacy])
  assert.ok(list.json.every(r => Array.isArray(r.destinations)))
  const one = await vgCall('getServiceRequest', { serviceRequestId: id }, { token: tokens.users.sc })
  assert.deepEqual(one.json.destinations, [clinic, pharmacy])
  const vssList = await vgCall('getVolunteerRequests', { scope: 'open' }, { token: tokens.users.vssJoe })
  assert.deepEqual(vssList.json.find(r => String(r.serviceRequestId) === id).destinations, [clinic, pharmacy])
  const vssOne = await vgCall('getVolunteerRequest', { serviceRequestId: id }, { token: tokens.users.vssJoe })
  assert.equal(vssOne.status, 200)
  assert.deepEqual(vssOne.json.destinations, [clinic, pharmacy])
})

test('audit: changing destinations records a before/after difference', async () => {
  const { json } = await create({ destinations: [clinic] })
  const id = json.serviceRequestId
  assert.equal((await patch(id, { destinations: [clinic, { destination: 'Pharmacy' }] })).status, 200)
  const rows = await auditRows('serviceRequest', id)
  const last = rows[rows.length - 1]
  assert.equal(last.action, 'update')
  assert.deepEqual(last.changes.diff.destinations, { added: ['Pharmacy'] })
})

test('PATCH that sends the same list unchanged records no destinations difference in the audit', async () => {
  const { json } = await create({ destinations: [clinic, pharmacy] })
  const id = json.serviceRequestId
  assert.equal((await patch(id, { destinations: [clinic, pharmacy], description: 'same list' })).status, 200)
  const rows = await auditRows('serviceRequest', id)
  const last = rows[rows.length - 1]
  assert.deepEqual(Object.keys(last.changes.diff), ['description'])
})

test('PATCH an Errand with no destinations into a Ride returns 422, whether or not a list is sent', async () => {
  const { json } = await create({})
  const id = json.serviceRequestId
  assert.equal((await patch(id, { serviceName: 'Ride: Medical appointment' })).status, 422)
  assert.equal((await patch(id, { serviceName: 'Ride: Medical appointment', destinations: [] })).status, 422)
  const ok = await patch(id, { serviceName: 'Ride: Medical appointment', destinations: [clinic] })
  assert.equal(ok.status, 200)
})

test('PATCH an Errand that has destinations into a Ride without sending a list succeeds', async () => {
  const { json } = await create({ destinations: [clinic] })
  assert.equal((await patch(json.serviceRequestId, { serviceName: 'Ride: Medical appointment' })).status, 200)
})

test('a legacy Ride with no destination rows still accepts a status PATCH', async () => {
  const { json } = await create({ serviceName: 'Ride: Medical appointment', destinations: [clinic] })
  const id = json.serviceRequestId
  await withDb(c => c.query('DELETE FROM service_request_destination WHERE serviceRequestId = ?', [id]))
  assert.equal((await patch(id, { status: 'Member cancelled' })).status, 200)
  assert.equal((await patch(id, { serviceName: 'Ride: Harbor clinic' })).status, 200)
})
