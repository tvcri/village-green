import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'
import { users } from '../../setup/fixtures.js'

// Holds: what the sync is leaving alone. One OPEN hold per subject
// (constituent, person, field, reason); rows change state, never disappear.
const sync = tokens.users.sync
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

const create = (items, token = sync) => vgCall('createSyncHolds', {}, { token, body: items })
const patch = (items, token = sync) => vgCall('patchSyncHolds', {}, { token, body: items })
const dismiss = (holdId, body, token = sync) => vgCall('createSyncHoldDismissal', { holdId }, { token, body })
const list = (query = {}, token = sync) => vgCall('getSyncHolds', query, { token })
const hold = (extra = {}) => ({ lglConstituentId: uniq('C'), personId: '810001', field: 'address', reason: 'never-agreed', fingerprint: 'fp1', ...extra })
const countFor = (lglConstituentId) => withDb(async (db) => {
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM sync_hold WHERE lglConstituentId = ?', [lglConstituentId])
  return n
})
const byId = async (holdId) => (await list({ state: ['open', 'closed', 'dismissed'] })).json.find(h => h.holdId === holdId)

test('open a batch and read it back', async () => {
  const items = [hold({ detail: { candidates: [1, 2] } }), hold({ personId: null, field: null, reason: 'match-ambiguous' })]
  const res = await create(items)
  assert.equal(res.status, 200)
  assert.equal(res.json.length, 2)
  res.json.forEach((h, i) => {
    assert.equal(typeof h.holdId, 'string')
    assert.equal(h.lglConstituentId, items[i].lglConstituentId)
    assert.equal(h.state, 'open')
    assert.equal(h.firstSeenAt, h.lastSeenAt)
    assert.equal(h.dismissalKind, null)
  })
  assert.deepEqual(res.json[0].detail, { candidates: [1, 2] })
  assert.equal(res.json[1].personId, null)
  const open = (await list()).json
  assert.ok(res.json.every(h => open.some(o => o.holdId === h.holdId)))
})

test('a new hold reads back the resolution and closer columns as null', async () => {
  const [h] = (await create([hold()])).json
  const got = await byId(h.holdId)
  assert.equal(got.resolution, null)
  assert.equal(got.resolvedAt, null)
  assert.equal(got.resolvedUserId, null)
  assert.equal(got.closedUserId, null)
})

test('duplicate open hold is refused with 409 naming the item', async () => {
  const h = hold()
  assert.equal((await create([h])).status, 200)
  const res = await create([hold(), { ...h, fingerprint: 'fp2' }])
  assert.equal(res.status, 409)
  assert.match(JSON.stringify(res.json), /item 1/)
  assert.equal(await countFor(h.lglConstituentId), 1)
})

test('duplicate open hold inside one batch is refused', async () => {
  const h = hold()
  const res = await create([h, { ...h }])
  assert.equal(res.status, 409)
  assert.match(JSON.stringify(res.json), /item 1/)
  assert.equal(await countFor(h.lglConstituentId), 0)
})

test('null personId and field still collide', async () => {
  const h = hold({ personId: null, field: null, reason: 'lgl-missing' })
  assert.equal((await create([h])).status, 200)
  assert.equal((await create([{ ...h }])).status, 409)
})

test('a closed hold does not block a new open one', async () => {
  const h = hold()
  const [first] = (await create([h])).json
  assert.equal((await patch([{ holdId: first.holdId, state: 'closed' }])).status, 200)
  assert.equal((await create([h])).status, 200)
  assert.equal(await countFor(h.lglConstituentId), 2)
})

test('insert already dismissed records kind and caller', async () => {
  const res = await create([hold({ state: 'dismissed', dismissalKind: 'staff', note: 'import review: skip' })])
  assert.equal(res.status, 200)
  const [h] = res.json
  assert.equal(h.state, 'dismissed')
  assert.equal(h.dismissalKind, 'staff')
  assert.equal(h.dismissedUserId, String(users.sync.userId))
  assert.ok(h.dismissedAt)
  assert.equal(h.note, 'import review: skip')
})

test('dismissed without a kind is 422', async () => {
  const h = hold({ state: 'dismissed' })
  assert.equal((await create([h])).status, 422)
  assert.equal(await countFor(h.lglConstituentId), 0)
})

test('seen moves lastSeenAt only', async () => {
  const [h] = (await create([hold()])).json
  await new Promise(r => setTimeout(r, 20))
  assert.deepEqual((await patch([{ holdId: h.holdId, seen: true }])).json, { updated: 1 })
  const after = await byId(h.holdId)
  assert.ok(Date.parse(after.lastSeenAt) > Date.parse(h.lastSeenAt))
  assert.equal(after.firstSeenAt, h.firstSeenAt)
  assert.equal(after.state, 'open')
})

test('updated counts only items that changed something', async () => {
  const [a] = (await create([hold()])).json
  const [b] = (await create([hold()])).json
  assert.deepEqual((await patch([{ holdId: a.holdId }, { holdId: b.holdId, seen: true }])).json, { updated: 1 })
})

test('fingerprint and detail update in place', async () => {
  const [h] = (await create([hold()])).json
  assert.equal((await patch([{ holdId: h.holdId, fingerprint: 'fp9', detail: { lgl: 'x' } }])).status, 200)
  const after = await byId(h.holdId)
  assert.equal(after.fingerprint, 'fp9')
  assert.deepEqual(after.detail, { lgl: 'x' })
})

test('close sets closedAt', async () => {
  const [h] = (await create([hold()])).json
  assert.equal((await patch([{ holdId: h.holdId, state: 'closed' }])).status, 200)
  const after = await byId(h.holdId)
  assert.equal(after.state, 'closed')
  assert.ok(after.closedAt)
})

test('reopen from dismissed clears the dismissal columns', async () => {
  const [h] = (await create([hold({ state: 'dismissed', dismissalKind: 'rule', note: 'old gift' })])).json
  assert.equal((await patch([{ holdId: h.holdId, state: 'open' }])).status, 200)
  const after = await byId(h.holdId)
  assert.equal(after.state, 'open')
  assert.equal(after.dismissalKind, null)
  assert.equal(after.dismissedAt, null)
  assert.equal(after.dismissedUserId, null)
  assert.equal(after.note, null)
})

test('illegal transitions are 422', async () => {
  const [open] = (await create([hold()])).json
  assert.equal((await patch([{ holdId: open.holdId, state: 'open' }])).status, 422)
  const [closed] = (await create([hold()])).json
  await patch([{ holdId: closed.holdId, state: 'closed' }])
  assert.equal((await patch([{ holdId: closed.holdId, state: 'open' }])).status, 422)
  assert.equal((await patch([{ holdId: closed.holdId, state: 'closed' }])).status, 422)
  assert.equal((await dismiss(closed.holdId, { dismissalKind: 'staff' })).status, 422)
  assert.equal((await patch([{ holdId: open.holdId, state: 'dismissed' }])).status, 400, 'dismissal goes through its own endpoint')
})

test('reopen colliding with an open hold is 409', async () => {
  const h = hold()
  const [dismissed] = (await create([{ ...h, state: 'dismissed', dismissalKind: 'rule' }])).json
  assert.equal((await create([h])).status, 200)
  const res = await patch([{ holdId: dismissed.holdId, state: 'open' }])
  assert.equal(res.status, 409)
  assert.equal((await byId(dismissed.holdId)).state, 'dismissed')
})

test('unknown holdId in a patch is 404 and nothing changes', async () => {
  const [h] = (await create([hold()])).json
  const res = await patch([{ holdId: h.holdId, state: 'closed' }, { holdId: '2147483000', seen: true }])
  assert.equal(res.status, 404)
  assert.equal((await byId(h.holdId)).state, 'open')
})

test('dismiss one records kind, note and caller', async () => {
  const [h] = (await create([hold()])).json
  const res = await dismiss(h.holdId, { dismissalKind: 'staff', note: 'engineer accepted' }, tokens.users.admin)
  assert.equal(res.status, 200)
  assert.equal(res.json.state, 'dismissed')
  assert.equal(res.json.dismissalKind, 'staff')
  assert.equal(res.json.note, 'engineer accepted')
  assert.equal(res.json.dismissedUserId, String(users.admin.userId))
  assert.ok(res.json.dismissedAt)
  assert.equal((await dismiss('2147483000', { dismissalKind: 'staff' })).status, 404)
})

const closure = (holdId, body = {}, token = tokens.users.admin) => vgCall('createSyncHoldClosure', { holdId }, { token, body })

test('staff close sets closedAt and closedUserId', async () => {
  const [h] = (await create([hold({ reason: 'addressee', field: null })])).json
  const res = await closure(h.holdId, { note: 'fixed the envelope name' })
  assert.equal(res.status, 200)
  assert.equal(res.json.state, 'closed')
  assert.ok(res.json.closedAt)
  assert.equal(res.json.closedUserId, String(users.admin.userId))
  assert.equal(res.json.note, 'fixed the envelope name')
})

test('the sync closing a hold leaves closedUserId null', async () => {
  const [h] = (await create([hold()])).json
  await patch([{ holdId: h.holdId, state: 'closed' }])
  assert.equal((await byId(h.holdId)).closedUserId, null)
})

test('close refuses other reasons and non-open holds', async () => {
  const [other] = (await create([hold()])).json
  assert.equal((await closure(other.holdId)).status, 422)
  const [done] = (await create([hold({ reason: 'lgl-incomplete', field: null })])).json
  assert.equal((await closure(done.holdId)).status, 200)
  assert.equal((await closure(done.holdId)).status, 422)
  assert.equal((await closure('2147483000')).status, 404)
  assert.equal((await byId(other.holdId)).state, 'open')
})

test('persons projection names the person, candidates and resolution target', async () => {
  const mk = async () => (await vgCall('createPerson', {}, { token: tokens.users.staff, body: { villageId: null, firstName: 'Proj', lastName: uniq('Ection') } })).json.personId
  const [a, b, c] = [await mk(), await mk(), await mk()]
  const [h] = (await create([hold({ personId: null, field: null, reason: 'name-only', detail: { candidates: [a, b, '999999999'] } })])).json
  await vgCall('createSyncHoldResolution', { holdId: h.holdId }, { token: tokens.users.admin, body: { kind: 'link', personId: c } })
  const got = (await list({ lglConstituentId: h.lglConstituentId, projection: ['persons'] })).json[0]
  assert.deepEqual(got.persons.map(p => p.personId), [a, b, c])
  for (const p of got.persons) {
    assert.match(p.fullName, /^Ection/)
    assert.match(p.displayName, /^Proj /)
    assert.equal(p.isDonor, false)
  }
})

test('without the projection there is no persons property', async () => {
  const [h] = (await create([hold()])).json
  const got = (await list({ lglConstituentId: h.lglConstituentId })).json[0]
  assert.equal('persons' in got, false)
  assert.equal('users' in got, false)
})

test('users projection names who dismissed', async () => {
  const [h] = (await create([hold()])).json
  await dismiss(h.holdId, { dismissalKind: 'staff' }, tokens.users.admin)
  const got = (await list({ state: ['dismissed'], lglConstituentId: h.lglConstituentId, projection: ['users'] })).json[0]
  assert.equal(got.users.length, 1)
  assert.equal(got.users[0].userId, String(users.admin.userId))
  assert.ok(got.users[0].displayName)
})

test('state filter', async () => {
  const [o] = (await create([hold()])).json
  const [d] = (await create([hold({ state: 'dismissed', dismissalKind: 'rule' })])).json
  const def = (await list()).json
  assert.ok(def.some(h => h.holdId === o.holdId))
  assert.ok(!def.some(h => h.holdId === d.holdId))
  assert.ok(def.every(h => h.state === 'open'))
  const both = (await list({ state: ['open', 'dismissed'] })).json
  assert.ok(both.some(h => h.holdId === d.holdId) && both.some(h => h.holdId === o.holdId))
  const byConstituent = (await list({ state: ['dismissed'], lglConstituentId: d.lglConstituentId })).json
  assert.deepEqual(byConstituent.map(h => h.holdId), [d.holdId])
})

test('staff is refused', async () => {
  const staff = tokens.users.staff
  assert.equal((await list({}, staff)).status, 403)
  assert.equal((await create([hold()], staff)).status, 403)
  assert.equal((await patch([{ holdId: '1', seen: true }], staff)).status, 403)
  assert.equal((await dismiss('1', { dismissalKind: 'staff' }, staff)).status, 403)
  assert.equal((await closure('1', {}, staff)).status, 403)
})
