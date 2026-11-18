import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { users } from '../../setup/fixtures.js'

// Staff resolutions: the answer to "who is this unlinked LGL donor?", stored
// on the hold for the sync to carry out. The hold stays open until the sync
// acts on it.
const sync = tokens.users.sync
const admin = tokens.users.admin
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

const create = (items) => vgCall('createSyncHolds', {}, { token: sync, body: items })
const resolve = (holdId, body, token = admin) => vgCall('createSyncHoldResolution', { holdId }, { token, body })
const list = (query = {}) => vgCall('getSyncHolds', query, { token: sync })
const byId = async (holdId) => (await list({ state: ['open', 'closed', 'dismissed'] })).json.find(h => h.holdId === holdId)
const unlinked = (extra = {}) => ({ lglConstituentId: uniq('C'), personId: null, field: null, reason: 'name-only', fingerprint: 'fp1', ...extra })
const openHold = async (extra) => (await create([unlinked(extra)])).json[0]

async function makePerson (lastName = uniq('Resolve')) {
  const res = await vgCall('createPerson', {}, { token: tokens.users.staff, body: { villageId: null, firstName: 'Pat', lastName } })
  assert.equal(res.status, 201)
  return res.json.personId
}
async function makeDonor (lglConstituentId = uniq('D')) {
  const personId = await makePerson()
  assert.equal((await vgCall('putPersonDonor', { personId }, { token: admin, body: { lglConstituentId } })).status, 200)
  return { personId, lglConstituentId }
}

test('link on an open name-only hold stores it and keeps the hold open', async () => {
  const h = await openHold()
  const personId = await makePerson()
  const res = await resolve(h.holdId, { kind: 'link', personId })
  assert.equal(res.status, 200)
  assert.equal(res.json.state, 'open')
  assert.deepEqual(res.json.resolution, { kind: 'link', personId })
  assert.equal(res.json.resolvedUserId, String(users.admin.userId))
  assert.ok(res.json.resolvedAt)
})

test('create on a dismissed staff import-skip reopens it', async () => {
  const h = await openHold({ reason: 'import-skip', state: 'dismissed', dismissalKind: 'staff' })
  const res = await resolve(h.holdId, { kind: 'create' })
  assert.equal(res.status, 200)
  assert.equal(res.json.state, 'open')
  assert.equal(res.json.dismissalKind, null)
  assert.equal(res.json.dismissedAt, null)
  assert.equal(res.json.dismissedUserId, null)
  assert.deepEqual(res.json.resolution, { kind: 'create' })
})

test('a resolution can be replaced while open', async () => {
  const h = await openHold()
  const first = await resolve(h.holdId, { kind: 'link', personId: await makePerson() })
  const second = await resolve(h.holdId, { kind: 'create', note: 'new to VG' })
  assert.equal(second.status, 200)
  assert.deepEqual(second.json.resolution, { kind: 'create' })
  assert.equal(second.json.note, 'new to VG')
  assert.ok(new Date(second.json.resolvedAt) >= new Date(first.json.resolvedAt))
})

test('refusals leave the hold unresolved', async () => {
  const personId = await makePerson()
  const donor = await makeDonor()
  const cases = [
    [await openHold({ personId: '810001', field: 'address', reason: 'never-agreed' }), { kind: 'create' }, 422],
    [await openHold({ reason: 'before-horizon' }), { kind: 'create' }, 422],
    [await openHold({ reason: 'anonymous' }), { kind: 'link', personId }, 422],
    [await openHold(), { kind: 'link' }, 422],
    [await openHold(), { kind: 'create', personId }, 422],
    [await openHold(), { kind: 'link', personId: donor.personId }, 422],
    [await openHold(), { kind: 'link', personId: '999999999' }, 404],
    [await openHold({ state: 'dismissed', dismissalKind: 'rule' }), { kind: 'create' }, 422],
  ]
  for (const [h, body, status] of cases) {
    const res = await resolve(h.holdId, body)
    assert.equal(res.status, status, `${h.reason} ${JSON.stringify(body)}: ${JSON.stringify(res.json)}`)
    assert.equal((await byId(h.holdId)).resolution, null)
  }
  const linked = await resolve((await openHold()).holdId, { kind: 'link', personId: donor.personId })
  assert.match(linked.json.detail, new RegExp(donor.lglConstituentId))

  const closed = await openHold()
  await vgCall('patchSyncHolds', {}, { token: sync, body: [{ holdId: closed.holdId, state: 'closed' }] })
  assert.equal((await resolve(closed.holdId, { kind: 'create' })).status, 422)
  assert.equal((await resolve('2147483000', { kind: 'create' })).status, 404)
})

test('link only is allowed for before-horizon', async () => {
  const h = await openHold({ reason: 'before-horizon' })
  assert.equal((await resolve(h.holdId, { kind: 'link', personId: await makePerson() })).status, 200)
})

test('two donors cannot wait on one person', async () => {
  const personId = await makePerson()
  const first = await openHold()
  assert.equal((await resolve(first.holdId, { kind: 'link', personId })).status, 200)
  const second = await openHold()
  const res = await resolve(second.holdId, { kind: 'link', personId })
  assert.equal(res.status, 422)
  assert.match(res.json.detail, new RegExp(first.lglConstituentId))
  // the first may change its own answer to the same person
  assert.equal((await resolve(first.holdId, { kind: 'link', personId })).status, 200)
})

test('resolving a dismissed hold onto an open twin is 409', async () => {
  const lglConstituentId = uniq('C')
  const dismissed = await openHold({ lglConstituentId, state: 'dismissed', dismissalKind: 'staff' })
  await openHold({ lglConstituentId })
  const res = await resolve(dismissed.holdId, { kind: 'create' })
  assert.equal(res.status, 409)
  const after = await byId(dismissed.holdId)
  assert.equal(after.state, 'dismissed')
  assert.equal(after.resolution, null)
})

test('staff without sync:write is refused', async () => {
  assert.equal((await resolve('1', { kind: 'create' }, tokens.users.staff)).status, 403)
})
