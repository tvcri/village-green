import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { withDb } from '../../lib/db.js'
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

// ---- held reports (the JotForm sync's holds) never reach a Friends read ----

test('a held report is hidden from staff, village scope and every filter', async (t) => {
  const stamp = String(Date.now())
  const mk = (n, held) => ({
    id: `64${stamp.padStart(13, '0')}${n}`, submittedAt: '2026-10-01 09:15:30', jotformUpdatedAt: '2026-10-01 09:15:30',
    villageId: quahog, villageName: 'Quahog',
    volunteerFirst: 'Jane', volunteerLast: 'Doe', rawVolunteerName: 'Jane Doe', volunteerEmail: null,
    volunteerPersonId: String(persons.quahogVolunteer.id), volunteerMatch: 'name-village',
    memberFirst: 'John', memberLast: 'Roe', rawMemberName: 'John Roe',
    memberPersonId: String(persons.quahogMember.id), memberMatch: 'name-village',
    visitDate: '2026-09-30', timeSpentMinutes: 45, contactType: 'Phone',
    activityTypes: ['Phone call'], activityOther: null, notes: 'Held test', reportingTag: '2026-10-01', held,
  })
  const shown = mk('0001', null)
  const held = mk('0002', 'name')
  t.after(() => withDb(c => c.query('DELETE FROM fcv_submission WHERE id IN (?, ?)', [shown.id, held.id])))
  for (const row of [shown, held]) {
    const put = await vgCall('putFcvSyncSubmission', { submissionId: row.id }, { token: tokens.users.jotform, body: row })
    assert.equal(put.status, 200)
  }
  const calls = [
    ['staff', {}, tokens.users.staff],
    ['village scope', { villageId: [quahog] }, tokens.users.full_v1],
    ['volunteer filter', { volunteerPersonId: String(persons.quahogVolunteer.id) }, tokens.users.staff],
    ['member filter', { memberPersonId: String(persons.quahogMember.id) }, tokens.users.staff],
    ['date filter', { dateStart: '2026-09-30', dateEnd: '2026-09-30' }, tokens.users.staff],
  ]
  for (const [label, query, token] of calls) {
    const { status, json } = await vgCall('getFriends', query, { token })
    assert.equal(status, 200, label)
    const ids = idsOf(json)
    assert.ok(ids.includes(shown.id), `${label}: the unheld report is listed`)
    assert.ok(!ids.includes(held.id), `${label}: the held report is not`)
  }
})
