import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { users, persons, villages } from '../../setup/fixtures.js'
import { auditRows } from '../audit/lib.js'

// /friends/sync/*: the JotForm sync's endpoints (reports, remembered names,
// holds) and the staff resolution of a hold. Reads and the sync's writes are
// for the jotform service account; the resolution needs fcv_sync:resolve,
// which only the admin role holds today.
const jf = tokens.users.jotform
const admin = tokens.users.admin
let seq = 0
const uniq = (s) => `${s}${Date.now()}${++seq}`
// 19 digits, above 2^53, like a real JotForm submission id
const newId = () => `64${String(Date.now()).padStart(13, '0')}${String(++seq).padStart(4, '0')}`

const putSub = (id, body, token = jf) => vgCall('putFcvSyncSubmission', { submissionId: id }, { token, body })
const getSubs = (token = jf) => vgCall('getFcvSyncSubmissions', {}, { token })
const subById = async (id) => (await getSubs()).json.find(s => s.id === id)
const putHolds = (body, token = jf) => vgCall('putFcvSyncHolds', {}, { token, body })
const getHolds = (query = {}, token = jf) => vgCall('getFcvSyncHolds', query, { token })
const resolve = (holdId, body, token = admin) => vgCall('createFcvSyncHoldResolution', { holdId }, { token, body })
const nameHold = (extra = {}) => ({
  kind: 'name', role: 'volunteer', nameKey: uniq('jane doe '), villageId: String(villages.quahog.id),
  rawName: 'Jane Doe', submissionId: null, detail: { candidates: [String(persons.quahogMember.id)] }, ...extra,
})
const openOf = async (h) => (await getHolds({ state: 'open' })).json.find(x =>
  x.kind === h.kind && x.nameKey === h.nameKey && String(x.submissionId) === String(h.submissionId))

const fullRow = (id) => ({
  id, submittedAt: '2026-10-01 09:15:30', jotformUpdatedAt: '2026-10-02 10:20:40',
  villageId: String(villages.quahog.id), villageName: 'Quahog',
  volunteerFirst: 'Jane', volunteerLast: 'Doe', rawVolunteerName: 'Jane Doe', volunteerEmail: 'jane.doe@example.test',
  volunteerPersonId: String(persons.quahogVolunteer.id), volunteerMatch: 'email',
  memberFirst: 'John', memberLast: 'Roe', rawMemberName: 'John Roe',
  memberPersonId: String(persons.quahogMember.id), memberMatch: 'name-village',
  visitDate: '2026-09-30', timeSpentMinutes: 45, contactType: 'Phone',
  activityTypes: ['Phone call', 'Ride'], activityOther: 'Brought soup', notes: 'Fine.',
  reportingTag: '2026-10-01', held: null,
})

test('put then get a submission round-trips every writable column', async () => {
  const id = newId()
  const row = fullRow(id)
  const put = await putSub(id, row)
  assert.equal(put.status, 200)
  const got = await subById(id)
  assert.deepEqual(got, { ...row, dateDecision: null })
  assert.deepEqual(put.json, got)
})

test('put ignores dateDecision in the body', async () => {
  const id = newId()
  assert.equal((await putSub(id, { ...fullRow(id), held: 'date' })).status, 200)
  const h = { kind: 'date', role: null, nameKey: null, villageId: null, rawName: null, submissionId: id, detail: { why: 'old' } }
  assert.equal((await putHolds([h])).status, 200)
  const open = await openOf(h)
  assert.ok(open)
  const res = await resolve(open.holdId, { accept: true })
  assert.equal(res.status, 200)
  assert.equal(res.json.state, 'open')
  assert.equal((await subById(id)).dateDecision, 'accept')
  assert.equal((await putSub(id, { ...fullRow(id), dateDecision: null })).status, 200)
  assert.equal((await subById(id)).dateDecision, 'accept')
  await putHolds([])
})

test('state cursor is the latest of submittedAt and jotformUpdatedAt', async (t) => {
  const a = newId(); const b = newId()
  // 2099-dated rows would hold the cursor for every later test: always remove them
  t.after(async () => {
    for (const id of [a, b]) await vgCall('deleteFcvSyncSubmission', { submissionId: id }, { token: jf })
  })
  await putSub(a, { ...fullRow(a), submittedAt: '2099-01-01 00:00:00', jotformUpdatedAt: null })
  assert.equal((await vgCall('getFcvSyncState', {}, { token: jf })).json.cursor, '2099-01-01 00:00:00')
  await putSub(b, { ...fullRow(b), submittedAt: '2098-01-01 00:00:00', jotformUpdatedAt: '2099-03-05 06:07:08' })
  const res = await vgCall('getFcvSyncState', {}, { token: jf })
  assert.equal(res.status, 200)
  assert.equal(res.json.cursor, '2099-03-05 06:07:08')
  assert.equal(typeof res.json.count, 'number')
  assert.ok(res.json.count >= 2)
})

test('delete removes the row; a second delete is 404', async () => {
  const id = newId()
  await putSub(id, fullRow(id))
  const del = () => vgCall('deleteFcvSyncSubmission', { submissionId: id }, { token: jf })
  assert.equal((await del()).status, 204)
  assert.equal(await subById(id), undefined)
  assert.equal((await del()).status, 404)
})

test('a date hold on a submission id above 2^53 resolves without losing digits', async () => {
  const id = '6412345678901234567'
  assert.ok(BigInt(id) > BigInt(Number.MAX_SAFE_INTEGER))
  await vgCall('deleteFcvSyncSubmission', { submissionId: id }, { token: jf })
  assert.equal((await putSub(id, { ...fullRow(id), held: 'date' })).status, 200)
  const h = { kind: 'date', role: null, nameKey: null, villageId: null, rawName: null, submissionId: id, detail: null }
  assert.equal((await putHolds([h])).status, 200)
  const open = await openOf(h)
  assert.equal(open.submissionId, id)
  const res = await resolve(open.holdId, { ignore: true })
  assert.equal(res.status, 200)
  assert.equal(res.json.submissionId, id)
  assert.equal((await subById(id)).dateDecision, 'ignore')
  await putHolds([])
  await vgCall('deleteFcvSyncSubmission', { submissionId: id }, { token: jf })
})

test('put with an invalid body is 422', async () => {
  const id = newId()
  assert.equal((await putSub(id, { ...fullRow(id), held: 'bogus' })).status, 422)
  assert.equal((await putSub(id, { ...fullRow(id), id: '1' })).status, 422)
})

test('put with a malformed timestamp or date is 400, not 500', async () => {
  const id = newId()
  for (const patch of [{ submittedAt: '2026-10-01T09:15:30Z' }, { submittedAt: 'yesterday' }, { jotformUpdatedAt: '2026-10-02' },
    { visitDate: '30/09/2026' }, { reportingTag: '2026-10-1' }]) {
    assert.equal((await putSub(id, { ...fullRow(id), ...patch })).status, 400, JSON.stringify(patch))
  }
  assert.equal((await putSub(id, { ...fullRow(id), jotformUpdatedAt: null })).status, 200)
  await vgCall('deleteFcvSyncSubmission', { submissionId: id }, { token: jf })
})

test('put without visitDate, timeSpentMinutes or contactType is 422 unless held unreadable', async () => {
  const id = newId()
  for (const col of ['visitDate', 'timeSpentMinutes', 'contactType']) {
    assert.equal((await putSub(id, { ...fullRow(id), [col]: null })).status, 422, col)
    assert.equal((await putSub(id, { ...fullRow(id), [col]: null, held: 'unreadable' })).status, 200, col)
  }
  assert.equal((await putSub(id, { ...fullRow(id), timeSpentMinutes: -1 })).status, 400)
  await vgCall('deleteFcvSyncSubmission', { submissionId: id }, { token: jf })
})

test('put holds twice with the same subject keeps one open hold', async () => {
  const h = nameHold()
  const first = await putHolds([h])
  assert.equal(first.status, 200)
  assert.deepEqual(first.json, { opened: 1, updated: 0, closed: first.json.closed })
  const again = await putHolds([{ ...h, rawName: 'Jane  Doe', detail: { candidates: [], n: 2 } }])
  assert.equal(again.json.opened, 0)
  assert.equal(again.json.updated, 1)
  const open = (await getHolds({ state: 'open' })).json.filter(x => x.nameKey === h.nameKey)
  assert.equal(open.length, 1)
  assert.equal(open[0].rawName, 'Jane  Doe')
  assert.deepEqual(open[0].detail, { candidates: [], n: 2 })
})

test('name keys that differ only by a letter the sync keeps (ø, ß) are distinct holds and answers', async () => {
  // The sync lowercases and strips accents but keeps ø and ß; MySQL's
  // utf8mb4_0900_ai_ci would equate them with o and ss.
  const tail = uniq(' ')
  const hØ = nameHold({ nameKey: `jane løe${tail}` })
  const hO = nameHold({ nameKey: `jane loe${tail}` })
  const hß = nameHold({ nameKey: `jane straße${tail}` })
  const hSs = nameHold({ nameKey: `jane strasse${tail}` })
  const res = await putHolds([hØ, hO, hß, hSs])
  assert.equal(res.status, 200)
  assert.equal(res.json.opened, 4)
  const again = await putHolds([hØ, hO, hß, hSs])
  assert.equal(again.status, 200)
  assert.deepEqual([again.json.opened, again.json.updated], [0, 4])
  const open = (await getHolds({ state: 'open' })).json.filter(x => x.nameKey.endsWith(tail))
  assert.equal(open.length, 4)

  const oØ = await openOf(hØ); const oO = await openOf(hO)
  const p1 = String(persons.quahogVolunteer.id); const p2 = String(persons.innsmouthVolunteer.id)
  assert.equal((await resolve(oØ.holdId, { personId: p1 })).status, 200)
  assert.equal((await resolve(oO.holdId, { personId: p2 })).status, 200)
  const matches = (await vgCall('getFcvSyncNameMatches', {}, { token: jf })).json.filter(m => m.nameKey.endsWith(tail))
  assert.deepEqual(matches.map(m => [m.nameKey, m.personId]).sort(),
    [[hO.nameKey, p2], [hØ.nameKey, p1]].sort())
  await putHolds([])
})

test('a subject left out of the body is closed', async () => {
  const keep = nameHold(); const drop = nameHold()
  await putHolds([keep, drop])
  const res = await putHolds([keep])
  assert.equal(res.json.closed >= 1, true)
  const open = (await getHolds({})).json
  assert.ok(open.some(x => x.nameKey === keep.nameKey))
  assert.ok(!open.some(x => x.nameKey === drop.nameKey))
  const closed = (await getHolds({ state: 'closed' })).json.find(x => x.nameKey === drop.nameKey)
  assert.equal(closed.state, 'closed')
  assert.ok(closed.closedAt)
})

test('holds carry the persons named in detail.candidates', async () => {
  const h = nameHold()
  await putHolds([h])
  const got = (await getHolds({})).json.find(x => x.nameKey === h.nameKey)
  assert.equal(got.persons.length, 1)
  assert.equal(got.persons[0].personId, String(persons.quahogMember.id))
  assert.ok(got.persons[0].displayName)
  assert.ok('village' in got.persons[0])
  assert.equal(got.villageId, h.villageId)
})

test('resolution on a name hold writes fcv_name_match and is returned by name-matches', async () => {
  const h = nameHold()
  await putHolds([h])
  const open = await openOf(h)
  const p1 = String(persons.quahogVolunteer.id)
  const res = await resolve(open.holdId, { personId: p1 })
  assert.equal(res.status, 200)
  assert.equal(res.json.holdId, open.holdId)
  assert.equal(res.json.state, 'open')
  const find = async () => (await vgCall('getFcvSyncNameMatches', {}, { token: jf })).json
    .find(m => m.nameKey === h.nameKey)
  assert.deepEqual(await find(), { role: 'volunteer', nameKey: h.nameKey, villageId: h.villageId, personId: p1, ignore: false })
  // again: replaces the person
  const p2 = String(persons.innsmouthVolunteer.id)
  assert.equal((await resolve(open.holdId, { personId: p2 })).status, 200)
  assert.equal((await find()).personId, p2)
  // then ignore
  assert.equal((await resolve(open.holdId, { ignore: true })).status, 200)
  assert.deepEqual(await find(), { role: 'volunteer', nameKey: h.nameKey, villageId: h.villageId, personId: null, ignore: true })
})

test('a resolution is audited under the hold, naming the acting user', async () => {
  const h = nameHold()
  await putHolds([h])
  const open = await openOf(h)
  const p1 = String(persons.quahogVolunteer.id)
  const p2 = String(persons.innsmouthVolunteer.id)
  assert.equal((await resolve(open.holdId, { personId: p1 })).status, 200)
  assert.equal((await resolve(open.holdId, { personId: p2 })).status, 200)
  assert.equal((await resolve(open.holdId, { ignore: true })).status, 200)
  assert.equal((await resolve(open.holdId, { ignore: true })).status, 200) // no change: no row
  const rows = await auditRows('fcvHold', open.holdId)
  assert.equal(rows.length, 3)
  for (const r of rows) { assert.equal(r.userId, users.admin.userId); assert.equal(r.action, 'update') }
  assert.deepEqual(rows[0].changes.diff, { matchPersonId: { old: null, new: p1 }, matchIgnore: { old: null, new: false } })
  assert.deepEqual(rows[1].changes.diff, { matchPersonId: { old: p1, new: p2 } })
  assert.deepEqual(rows[2].changes.diff, { matchPersonId: { old: p2, new: null }, matchIgnore: { old: false, new: true } })
  await putHolds([])
})

test('a date resolution is audited as a dateDecision change', async () => {
  const id = newId()
  await putSub(id, { ...fullRow(id), held: 'date' })
  const h = { kind: 'date', role: null, nameKey: null, villageId: null, rawName: null, submissionId: id, detail: null }
  await putHolds([h])
  const open = await openOf(h)
  assert.equal((await resolve(open.holdId, { accept: true })).status, 200)
  assert.equal((await resolve(open.holdId, { ignore: true })).status, 200)
  const rows = await auditRows('fcvHold', open.holdId)
  assert.deepEqual(rows.map(r => [r.userId, r.changes.diff]), [
    [users.admin.userId, { dateDecision: { old: null, new: 'accept' } }],
    [users.admin.userId, { dateDecision: { old: 'accept', new: 'ignore' } }],
  ])
  await putHolds([])
  await vgCall('deleteFcvSyncSubmission', { submissionId: id }, { token: jf })
})

test('a rejected resolution writes no audit row', async () => {
  const h = nameHold()
  await putHolds([h])
  const open = await openOf(h)
  assert.equal((await resolve(open.holdId, { personId: '2000000000' })).status, 422)
  assert.equal((await auditRows('fcvHold', open.holdId)).length, 0)
  await putHolds([])
})

test('a resolution must name a person who holds the hold\'s role', async () => {
  const h = nameHold() // a volunteer-name hold
  await putHolds([h])
  const open = await openOf(h)
  // quahogMember has a member record only
  const res = await resolve(open.holdId, { personId: String(persons.quahogMember.id) })
  assert.equal(res.status, 422)
  assert.match(JSON.stringify(res.json), /not a volunteer/)
  const matches = (await vgCall('getFcvSyncNameMatches', {}, { token: jf })).json
  assert.equal(matches.filter(m => m.nameKey === h.nameKey).length, 0)
  assert.equal((await auditRows('fcvHold', open.holdId)).length, 0)
  // a member hold is the other way round
  const mh = nameHold({ role: 'member' })
  await putHolds([mh])
  const mopen = await openOf(mh)
  assert.equal((await resolve(mopen.holdId, { personId: String(persons.quahogVolunteer.id) })).status, 422)
  assert.equal((await resolve(mopen.holdId, { personId: String(persons.quahogMember.id) })).status, 200)
  await putHolds([])
})

test('a Dropped volunteer or member record still satisfies the role', async () => {
  const h = nameHold()
  const mh = nameHold({ role: 'member' })
  await putHolds([h, mh])
  const open = await openOf(h)
  const mopen = await openOf(mh)
  assert.equal((await resolve(open.holdId, { personId: String(persons.quahogDroppedVolunteer.id) })).status, 200)
  assert.equal((await resolve(mopen.holdId, { personId: String(persons.quahogDroppedMember.id) })).status, 200)
  await putHolds([])
})

test('a put naming a person or village that does not exist is 422 naming the column', async () => {
  for (const [col, val] of [['memberPersonId', '999999999'], ['volunteerPersonId', '999999999'], ['villageId', '999999999']]) {
    const id = newId()
    const res = await putSub(id, { ...fullRow(id), [col]: val })
    assert.equal(res.status, 422, col)
    assert.match(JSON.stringify(res.json), new RegExp(col))
    assert.equal(await subById(id), undefined)
  }
})

test('name match for an unknown village is returned with villageId null', async () => {
  const h = nameHold({ villageId: null })
  await putHolds([h])
  const open = await openOf(h)
  assert.equal((await resolve(open.holdId, { ignore: true })).status, 200)
  const m = (await vgCall('getFcvSyncNameMatches', {}, { token: jf })).json.find(x => x.nameKey === h.nameKey)
  assert.equal(m.villageId, null)
})

test('resolution on a closed hold is 409; unknown personId is 422', async () => {
  const h = nameHold()
  await putHolds([h])
  const open = await openOf(h)
  assert.equal((await resolve(open.holdId, { personId: '2000000000' })).status, 422)
  assert.equal((await resolve(open.holdId, { accept: true })).status, 422)
  await putHolds([])
  assert.equal((await resolve(open.holdId, { ignore: true })).status, 409)
})

test('resolution on an unknown hold is 404', async () => {
  assert.equal((await resolve('2000000000', { ignore: true })).status, 404)
})

test('the sync account cannot resolve; staff cannot sync', async () => {
  const h = nameHold()
  await putHolds([h])
  const open = await openOf(h)
  assert.equal((await resolve(open.holdId, { ignore: true }, jf)).status, 403)
  assert.equal((await getSubs(tokens.users.staff)).status, 403)
  assert.equal((await putHolds([], tokens.users.staff)).status, 403)
})

test('a village-scoped user gets 403 on every /friends/sync path; so does mailchimp', async () => {
  const id = newId()
  const calls = [
    ['getFcvSyncState', {}, undefined],
    ['getFcvSyncSubmissions', {}, undefined],
    ['putFcvSyncSubmission', { submissionId: id }, fullRow(id)],
    ['deleteFcvSyncSubmission', { submissionId: id }, undefined],
    ['getFcvSyncNameMatches', {}, undefined],
    ['putFcvSyncHolds', {}, []],
    ['getFcvSyncHolds', {}, undefined],
    ['createFcvSyncHoldResolution', { holdId: '1' }, { ignore: true }],
  ]
  for (const token of [tokens.users.full_v1, tokens.users.owner_v1, tokens.users.mailchimp]) {
    for (const [op, params, body] of calls) {
      const res = await vgCall(op, params, { token, body })
      assert.equal(res.status, 403, `${op}`)
    }
  }
  assert.equal(users.jotform.userId, 16)
})

test('a token without a friends sync scope gets 403', async () => {
  const res = await getSubs(tokens.special.readOnly)
  assert.equal(res.status, 403)
})
