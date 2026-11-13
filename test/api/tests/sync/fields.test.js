import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'

// Sync memory: GET/PUT /sync/fields. One row per person and field, upserted.
// No FK to person, so tests use person ids no fixture has, unique per test.
const sync = tokens.users.sync
let nextId = 800000 + Math.round(Math.random() * 90000) * 10
const freshPersonId = () => String(++nextId)

const put = (items, token = sync) => vgCall('putSyncFields', {}, { token, body: items })
const get = (query = {}, token = sync) => vgCall('getSyncFields', query, { token })
const countFor = (personId) => withDb(async (db) => {
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM sync_field WHERE personId = ?', [personId])
  return n
})
const row = (personId, field, value, extra = {}) => ({ personId, field, lglConstituentId: '720001', value, lglEntryId: null, ...extra })
const strip = ({ agreedAt, ...rest }) => rest

test('upsert then read by person', async () => {
  const p = freshPersonId()
  const items = [row(p, 'email', 'dana@example.test', { lglEntryId: 'E1' }), row(p, 'firstName', 'Dana')]
  const res = await put(items)
  assert.equal(res.status, 200)
  assert.deepEqual(res.json, { upserted: 2 })
  const read = await get({ personId: [p] })
  assert.equal(read.status, 200)
  assert.deepEqual(read.json.map(strip).sort((a, b) => a.field.localeCompare(b.field)), items)
  for (const r of read.json) assert.ok(!Number.isNaN(Date.parse(r.agreedAt)), 'agreedAt is a date-time')
})

test('upsert overwrites value, constituent and entry, and moves agreedAt', async () => {
  const p = freshPersonId()
  await put([row(p, 'phone', '4015550100', { lglEntryId: 'P1' })])
  const [first] = (await get({ personId: [p] })).json
  await new Promise(r => setTimeout(r, 20))
  await put([row(p, 'phone', '4015550101', { lglConstituentId: '720002', lglEntryId: 'P2' })])
  const [second] = (await get({ personId: [p] })).json
  assert.deepEqual(strip(second), row(p, 'phone', '4015550101', { lglConstituentId: '720002', lglEntryId: 'P2' }))
  assert.ok(Date.parse(second.agreedAt) > Date.parse(first.agreedAt), 'agreedAt moved')
  assert.equal(await countFor(p), 1)
})

test('same key twice in one batch keeps the last', async () => {
  const p = freshPersonId()
  const res = await put([row(p, 'cell', 'first'), row(p, 'cell', 'second')])
  assert.equal(res.status, 200)
  const read = (await get({ personId: [p] })).json
  assert.equal(read.length, 1)
  assert.equal(read[0].value, 'second')
})

test('scalar and null values round-trip', async () => {
  const p = freshPersonId()
  const values = { s0: '0', n0: 0, f: false, nul: null, obj: { street: '1 Elm St', unit: null, nested: [1, 'two'] } }
  await put(Object.entries(values).map(([field, value]) => row(p, field, value)))
  const read = (await get({ personId: [p] })).json
  for (const [field, value] of Object.entries(values)) {
    assert.deepStrictEqual(read.find(r => r.field === field).value, value, field)
  }
})

test('read all returns every row', async () => {
  const p = freshPersonId()
  await put([row(p, 'suffix', 'Jr.')])
  const all = await get()
  assert.equal(all.status, 200)
  const [[{ n }]] = await withDb(db => db.query('SELECT COUNT(*) AS n FROM sync_field'))
  assert.equal(all.json.length, n)
  assert.ok(all.json.some(r => r.personId === p && r.field === 'suffix'))
})

test('personId filter accepts 500 and refuses 501', async () => {
  const ids = Array.from({ length: 501 }, (_, i) => String(1 + i))
  assert.equal((await get({ personId: ids.slice(0, 500) })).status, 200)
  assert.equal((await get({ personId: ids })).status, 400)
})

test('a batch of 501 is refused with 400', async () => {
  const p = freshPersonId()
  const items = Array.from({ length: 501 }, (_, i) => row(p, `f${i}`, i))
  assert.equal((await put(items)).status, 400)
  assert.equal(await countFor(p), 0)
})

test('an item missing field is refused and nothing is written', async () => {
  const p = freshPersonId()
  const { field, ...noField } = row(p, 'x', 1)
  const res = await put([row(p, 'ok', 1), noField])
  assert.equal(res.status, 400)
  assert.equal(await countFor(p), 0)
})

test('staff is refused', async () => {
  assert.equal((await get({}, tokens.users.staff)).status, 403)
  assert.equal((await put([row(freshPersonId(), 'email', 'x')], tokens.users.staff)).status, 403)
})
