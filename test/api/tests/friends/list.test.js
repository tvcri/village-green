import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, persons, fcvSubmissions as fcv } from '../../setup/fixtures.js'

// GET /friends correctness: village scoping and the query filters.
// Post-#56: a village-scope user must pass villageId ⊆ granted (no filter ->
// 403, covered in authz.test.js); federation readers (admin/staff/board/sc)
// see every village on a plain call. Seeded data: one FCV submission per
// village (fcvV1 Quahog, fcvV2 Innsmouth, fcvV3 Miskatonic). full_v1 ->
// Quahog, full_v2 -> Innsmouth, multi -> both.
const idsOf = (rows) => rows.map(r => r.friendId)
const quahog = String(villages.quahog.id)
const innsmouth = String(villages.innsmouth.id)

// ---- village scoping (GREEN) ----

test('full_v1 sees only its Quahog FCV submission', async () => {
  const { status, json } = await vgCall('getFriends', { villageId: [quahog] }, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok(ids.includes(String(fcv.fcvV1.id)), 'includes own Quahog submission')
  assert.ok(!ids.includes(String(fcv.fcvV2.id)), 'must not leak Innsmouth')
  assert.ok(!ids.includes(String(fcv.fcvV3.id)), 'must not leak Miskatonic')
})

test('FCV row joins volunteer + member names and echoes contactType', async () => {
  const { json } = await vgCall('getFriends', { villageId: [quahog] }, { token: tokens.users.full_v1 })
  const row = json.find(r => r.friendId === String(fcv.fcvV1.id))
  assert.ok(row, 'Quahog row present')
  assert.equal(row.volunteer.fullName, persons.quahogVolunteer.fullName)
  assert.equal(row.member.fullName, persons.quahogMember.fullName)
  assert.equal(row.contactType, fcv.fcvV1.contactType)
})

// ---- federation scope (GREEN) ----
// #56 removed elevation from resource reads: a federation grant reaches every
// village on a plain call, and there is no "admin without elevate" mode.

test('admin sees every village\'s submissions on a plain call', async () => {
  const { status, json } = await vgCall('getFriends', {}, { token: tokens.users.admin })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok([fcv.fcvV1, fcv.fcvV2, fcv.fcvV3].every(f => ids.includes(String(f.id))), 'sees all three villages')
})

test('board (federation read-only) also sees all villages', async () => {
  const { status, json } = await vgCall('getFriends', {}, { token: tokens.users.board })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok([fcv.fcvV1, fcv.fcvV2, fcv.fcvV3].every(f => ids.includes(String(f.id))), 'sees all three villages')
})

// ---- query filters within grants (GREEN), via multi (Quahog + Innsmouth) ----
// (the multi-value villageId test at the bottom pins that the union itself works)

test('contactType filter narrows to matching submissions', async () => {
  const { json } = await vgCall('getFriends',
    { villageId: [quahog, innsmouth], contactType: 'Phone' }, { token: tokens.users.multi })
  assert.deepEqual(idsOf(json), [String(fcv.fcvV2.id)]) // only the Innsmouth phone visit
})

test('activityType filter matches inside the JSON array', async () => {
  const { json } = await vgCall('getFriends',
    { villageId: [quahog, innsmouth], activityType: 'Ride' }, { token: tokens.users.multi })
  assert.deepEqual(idsOf(json), [String(fcv.fcvV1.id)]) // Quahog visit included a Ride
})

test('volunteerName filter is a substring match', async () => {
  const { json } = await vgCall('getFriends',
    { villageId: [quahog, innsmouth], volunteerName: 'Joe' }, { token: tokens.users.multi })
  assert.deepEqual(idsOf(json), [String(fcv.fcvV1.id)]) // Joe Swanson
})

test('dateStart filter excludes earlier visits', async () => {
  const { json } = await vgCall('getFriends',
    { villageId: [quahog, innsmouth], dateStart: '2026-06-02' }, { token: tokens.users.multi })
  const ids = idsOf(json)
  assert.ok(ids.includes(String(fcv.fcvV2.id)), 'keeps the 06-02 visit')
  assert.ok(!ids.includes(String(fcv.fcvV1.id)), 'drops the 06-01 visit')
})

test('single client villageId narrows within grants', async () => {
  const { json } = await vgCall('getFriends', { villageId: [innsmouth] }, { token: tokens.users.multi })
  assert.deepEqual(idsOf(json), [String(fcv.fcvV2.id)])
})

test('multi-value villageId returns both selected (granted) villages', async () => {
  // Formerly RED (finding #4: `[villageId]` double-wrap -> ER_OPERAND_COLUMNS
  // 500). Fixed by #56 — FriendService now binds the array directly. Assert the
  // row set too, not just the status: an under-returning regression (e.g. only
  // one selected village) must fail here.
  const { status, json } = await vgCall('getFriends',
    { villageId: [quahog, innsmouth] }, { token: tokens.users.multi })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok(ids.includes(String(fcv.fcvV1.id)), 'includes the Quahog submission')
  assert.ok(ids.includes(String(fcv.fcvV2.id)), 'includes the Innsmouth submission')
  assert.ok(!ids.includes(String(fcv.fcvV3.id)), 'still excludes ungranted Miskatonic')
})
