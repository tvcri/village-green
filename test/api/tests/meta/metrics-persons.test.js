import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'
import { villages, persons } from '../../setup/fixtures.js'

// GET /metrics/persons: the active roster plus anyone inactive who had
// Completed activity in range. Scenario rows are inserted here (ids 80-89,
// April 2026) and removed in after(), so the shared fixtures and the June
// metrics window stay untouched. Files run with concurrency 1.
const RANGE = { start: '2026-04-01', end: '2026-04-30' }

const quahog = villages.quahog.id
const innsmouth = villages.innsmouth.id

const DROPPED_ACTIVE = 80 // Quahog member, Dropped, one Completed request in range
const DROPPED_IDLE = 81 // Quahog member, Dropped, nothing in range
const INACTIVE_DRIVER = 82 // Innsmouth volunteer, inactive, drove a Quahog ride in range
const INACTIVE_IDLE = 83 // Quahog volunteer, inactive, nothing in range

async function cleanup (conn) {
  await conn.query('DELETE FROM service_request WHERE id BETWEEN 80 AND 89')
  await conn.query('DELETE FROM member WHERE id BETWEEN 80 AND 89')
  await conn.query('DELETE FROM volunteer WHERE id BETWEEN 80 AND 89')
  await conn.query('DELETE FROM person WHERE id BETWEEN 80 AND 89')
}

before(() => withDb(async conn => {
  await cleanup(conn)
  const person = (id, villageId, first, last) => conn.query(
    'INSERT INTO person (id, villageId, firstName, lastName) VALUES (?, ?, ?, ?)',
    [id, villageId, first, last])
  await person(DROPPED_ACTIVE, quahog, 'Mort', 'Goldman')
  await person(DROPPED_IDLE, quahog, 'Herbert', 'Herbert')
  await person(INACTIVE_DRIVER, innsmouth, 'Zadok', 'Allen')
  await person(INACTIVE_IDLE, quahog, 'Cleveland', 'Brown')
  await conn.query(`INSERT INTO member (id, personId, memberNumber, status) VALUES
    (80, ?, 'Q-8080', 'Dropped'), (81, ?, 'Q-8081', 'Dropped')`, [DROPPED_ACTIVE, DROPPED_IDLE])
  await conn.query('INSERT INTO volunteer (id, personId, active) VALUES (82, ?, 0), (83, ?, 0)',
    [INACTIVE_DRIVER, INACTIVE_IDLE])
  const sr = (id, memberPersonId, volunteerPersonId, status, serviceName, transportationType, serviceDate, villageId = quahog) =>
    conn.query(`INSERT INTO service_request
        (id, requestNumber, villageId, memberPersonId, volunteerPersonId, status, serviceName,
         transportationType, createdAt, serviceDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
    [id, 800 + id, villageId, memberPersonId, volunteerPersonId, status, serviceName, transportationType, serviceDate])
  // The dropped member's completed errand, driven by the active Quahog volunteer.
  await sr(80, DROPPED_ACTIVE, persons.quahogVolunteer.id, 'Completed', 'Errand: Shopping', null, '2026-04-02')
  // A Quahog round-trip ride driven by the inactive INNSMOUTH volunteer: counts
  // toward that volunteer although the request belongs to Quahog.
  await sr(81, persons.quahogMember.id, INACTIVE_DRIVER, 'Completed', 'Ride: Medical Appnt', 'Round Trip', '2026-04-03')
  // The active Innsmouth volunteer also drove for Quahog.
  await sr(82, persons.quahogMember.id, persons.innsmouthVolunteer.id, 'Completed', 'Ride: Medical Appnt', 'One Way', '2026-04-04')
  // ...and for Miskatonic, which the multi persona is not granted.
  await sr(85, persons.miskatonicMember.id, persons.innsmouthVolunteer.id, 'Completed', 'Ride: Medical Appnt', 'One Way', '2026-04-07', villages.miskatonic.id)
  // Not Completed: never counted.
  await sr(83, persons.quahogMember.id, persons.quahogVolunteer.id, 'Member cancelled', 'Ride: Medical Appnt', 'One Way', '2026-04-05')
  await sr(84, persons.quahogMember.id, null, 'Hub cancelled', 'Tech Support', null, '2026-04-06')
}))

after(() => withDb(cleanup))

const byId = (rows) => new Map(rows.map(r => [r.personId, r]))

async function board (params = {}) {
  const res = await vgCall('getMetaMetricsPersons', { ...RANGE, ...params }, { token: tokens.users.board })
  assert.equal(res.status, 200)
  return res.json
}

test('metrics persons: echoes the range', async () => {
  const json = await board()
  assert.deepEqual(json.range, RANGE)
})

test('metrics persons: an active member with no activity is listed with count 0', async () => {
  const m = byId((await board()).members).get(String(persons.innsmouthMember.id))
  assert.ok(m, 'active idle member missing')
  assert.equal(m.count, 0)
  assert.equal(m.completedRoundTrips, 0)
  assert.equal(m.status, 'Active')
  assert.equal(m.villageId, String(innsmouth))
})

test('metrics persons: an active volunteer with no activity is listed with count 0', async () => {
  const v = byId((await board()).volunteers).get(String(persons.miskatonicVolunteer.id))
  assert.ok(v, 'active idle volunteer missing')
  assert.equal(v.count, 0)
  assert.equal(v.active, true)
})

test('metrics persons: a dropped member with activity in range is listed', async () => {
  const m = byId((await board()).members).get(String(DROPPED_ACTIVE))
  assert.ok(m, 'dropped member with activity missing')
  assert.equal(m.status, 'Dropped')
  assert.equal(m.count, 1)
})

test('metrics persons: a dropped member with no activity in range is not listed', async () => {
  const json = await board()
  assert.equal(byId(json.members).has(String(DROPPED_IDLE)), false)
})

test('metrics persons: an inactive volunteer with activity in range is listed', async () => {
  const v = byId((await board()).volunteers).get(String(INACTIVE_DRIVER))
  assert.ok(v, 'inactive volunteer with activity missing')
  assert.equal(v.active, false)
  assert.equal(v.count, 1)
  assert.equal(v.completedRoundTrips, 1)
})

test('metrics persons: an inactive volunteer with no activity in range is not listed', async () => {
  const json = await board()
  assert.equal(byId(json.volunteers).has(String(INACTIVE_IDLE)), false)
})

test('metrics persons: only Completed requests in range count', async () => {
  // quahogMember: June has Completed rows (outside range); April has only a
  // Member cancelled and a Hub cancelled request, plus two Completed rides.
  const m = byId((await board()).members).get(String(persons.quahogMember.id))
  assert.equal(m.count, 2)
  assert.equal(m.completedRoundTrips, 1)
})

test('metrics persons: a count is person-wide, not limited to the person\'s village', async () => {
  const json = await board({ villageId: String(innsmouth) })
  const v = byId(json.volunteers).get(String(persons.innsmouthVolunteer.id))
  assert.ok(v, 'Innsmouth volunteer missing under the Innsmouth filter')
  assert.equal(v.count, 2, 'the Quahog and Miskatonic rides count toward the Innsmouth volunteer')
})

test('metrics persons: a count includes only requests in villages the caller is granted', async () => {
  const { json } = await vgCall('getMetaMetricsPersons', RANGE, { token: tokens.users.multi })
  const v = byId(json.volunteers).get(String(persons.innsmouthVolunteer.id))
  assert.equal(v.count, 1, 'the Miskatonic ride must not count for a caller without Miskatonic')
})

test('metrics persons: villageId limits rows to persons of that village', async () => {
  const json = await board({ villageId: String(innsmouth) })
  assert.ok(json.members.length > 0 && json.volunteers.length > 0)
  for (const r of [...json.members, ...json.volunteers]) {
    assert.equal(r.villageId, String(innsmouth), `person ${r.personId} is outside the filter`)
  }
})

test('metrics persons: a multi-village user sees only persons of granted villages', async () => {
  const { status, json } = await vgCall('getMetaMetricsPersons', RANGE, { token: tokens.users.multi })
  assert.equal(status, 200)
  const granted = new Set([String(quahog), String(innsmouth)])
  for (const r of [...json.members, ...json.volunteers]) {
    assert.ok(granted.has(r.villageId), `person ${r.personId} leaked village ${r.villageId}`)
  }
})

test('metrics persons: a villageId outside the caller\'s grants is refused', async () => {
  const { status } = await vgCall('getMetaMetricsPersons',
    { ...RANGE, villageId: String(villages.miskatonic.id) }, { token: tokens.users.multi })
  assert.equal(status, 403)
})

test('metrics persons: a grantless user is refused', async () => {
  const { status } = await vgCall('getMetaMetricsPersons', RANGE, { token: tokens.users.nogrants })
  assert.equal(status, 403)
})
