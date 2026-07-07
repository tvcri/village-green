import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { villages, persons, fcvSubmissions as fcv } from '../../setup/fixtures.js'

// GET /friends correctness: grant filtering, elevate, and the query filters.
// Seeded data: one FCV submission per village (fcvV1 Quahog, fcvV2 Innsmouth,
// fcvV3 Miskatonic). full_v1 -> Quahog, full_v2 -> Innsmouth, multi -> both.
const FRIENDS = '/friends'
const idsOf = (rows) => rows.map(r => r.friendId)

// ---- grant filtering (GREEN) ----

test('full_v1 sees only its Quahog FCV submission', async () => {
  const { status, json } = await vgFetch(FRIENDS, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok(ids.includes(String(fcv.fcvV1.id)), 'includes own Quahog submission')
  assert.ok(!ids.includes(String(fcv.fcvV2.id)), 'must not leak Innsmouth')
  assert.ok(!ids.includes(String(fcv.fcvV3.id)), 'must not leak Miskatonic')
})

test('FCV row joins volunteer + member names and echoes contactType', async () => {
  const { json } = await vgFetch(FRIENDS, { token: tokens.users.full_v1 })
  const row = json.find(r => r.friendId === String(fcv.fcvV1.id))
  assert.ok(row, 'Quahog row present')
  assert.equal(row.volunteer.fullName, persons.quahogVolunteer.fullName)
  assert.equal(row.member.fullName, persons.quahogMember.fullName)
  assert.equal(row.contactType, fcv.fcvV1.contactType)
})

test('nogrants user sees no FCV submissions', async () => {
  const { status, json } = await vgFetch(FRIENDS, { token: tokens.users.nogrants })
  assert.equal(status, 200)
  assert.equal(json.length, 0)
})

// ---- elevate (GREEN) ----

test('admin with elevate=true sees every village\'s submissions', async () => {
  const { status, json } = await vgFetch(FRIENDS, { token: tokens.users.admin, query: { elevate: 'true' } })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok([fcv.fcvV1, fcv.fcvV2, fcv.fcvV3].every(f => ids.includes(String(f.id))), 'sees all three villages')
})

test('admin without elevate is grant-filtered (admin holds no grants -> none)', async () => {
  const { status, json } = await vgFetch(FRIENDS, { token: tokens.users.admin })
  assert.equal(status, 200)
  assert.equal(json.length, 0)
})

test('non-admin elevate=true -> 403', async () => {
  const { status } = await vgFetch(FRIENDS, { token: tokens.users.full_v1, query: { elevate: 'true' } })
  assert.equal(status, 403)
})

// ---- query filters within grants (GREEN), via multi (Quahog + Innsmouth) ----

test('multi user sees Quahog + Innsmouth, not Miskatonic', async () => {
  const { json } = await vgFetch(FRIENDS, { token: tokens.users.multi })
  const ids = idsOf(json)
  assert.ok(ids.includes(String(fcv.fcvV1.id)) && ids.includes(String(fcv.fcvV2.id)))
  assert.ok(!ids.includes(String(fcv.fcvV3.id)))
})

test('contactType filter narrows to matching submissions', async () => {
  const { json } = await vgFetch(FRIENDS, { token: tokens.users.multi, query: { contactType: 'Phone' } })
  assert.deepEqual(idsOf(json), [String(fcv.fcvV2.id)]) // only the Innsmouth phone visit
})

test('activityType filter matches inside the JSON array', async () => {
  const { json } = await vgFetch(FRIENDS, { token: tokens.users.multi, query: { activityType: 'Ride' } })
  assert.deepEqual(idsOf(json), [String(fcv.fcvV1.id)]) // Quahog visit included a Ride
})

test('volunteerName filter is a substring match', async () => {
  const { json } = await vgFetch(FRIENDS, { token: tokens.users.multi, query: { volunteerName: 'Joe' } })
  assert.deepEqual(idsOf(json), [String(fcv.fcvV1.id)]) // Joe Swanson
})

test('dateStart filter excludes earlier visits', async () => {
  const { json } = await vgFetch(FRIENDS, { token: tokens.users.multi, query: { dateStart: '2026-06-02' } })
  const ids = idsOf(json)
  assert.ok(ids.includes(String(fcv.fcvV2.id)), 'keeps the 06-02 visit')
  assert.ok(!ids.includes(String(fcv.fcvV1.id)), 'drops the 06-01 visit')
})

test('single client villageId narrows within grants', async () => {
  const { json } = await vgFetch(FRIENDS, { token: tokens.users.multi, query: { villageId: String(villages.innsmouth.id) } })
  assert.deepEqual(idsOf(json), [String(fcv.fcvV2.id)])
})

// ---- multi-value villageId is double-wrapped -> 500 (RED — finding #4) ----

test('multi-value villageId returns both selected (granted) villages', async () => {
  // FriendService pushes `[villageId]` for the client filter; when villageId is
  // already an array (multiple selected) this becomes IN (('1','2')) — a nested
  // row constructor MySQL rejects with ER_OPERAND_COLUMNS (500). Same bug class
  // as service-request finding #3. The grant filter is always ANDed, so this can
  // only under-return, never leak — a correctness bug, not an exposure.
  const { status, json } = await vgFetch(FRIENDS, {
    token: tokens.users.multi,
    query: { villageId: [String(villages.quahog.id), String(villages.innsmouth.id)] },
  })
  assert.equal(status, 200)
  // Assert the row set too, not just the status: a partial fix that stops the
  // 500 but under-returns (e.g. only one selected village) must stay red.
  const ids = idsOf(json)
  assert.ok(ids.includes(String(fcv.fcvV1.id)), 'includes the Quahog submission')
  assert.ok(ids.includes(String(fcv.fcvV2.id)), 'includes the Innsmouth submission')
  assert.ok(!ids.includes(String(fcv.fcvV3.id)), 'still excludes ungranted Miskatonic')
})
