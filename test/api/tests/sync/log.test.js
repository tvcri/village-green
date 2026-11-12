import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'

// The record of writes to LGL. Writes to VG are in audit_event; LGL keeps no
// history of API writes, so this is the only record of those.
const sync = tokens.users.sync
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`
const append = (items, token = sync) => vgCall('createSyncLog', {}, { token, body: items })
const read = (query = {}, token = sync) => vgCall('getSyncLog', query, { token })
const entry = (extra = {}) => ({
  lglConstituentId: uniq('C'),
  personId: '820001',
  field: 'email',
  case: 'vg-changed',
  request: { method: 'PATCH', path: '/email_addresses/555', body: { address: 'new@example.test' } },
  lglEntryId: '555',
  oldValue: 'old@example.test',
  newValue: 'new@example.test',
  outcome: 'ok',
  responseStatus: 200,
  note: null,
  ...extra,
})

test('append a batch and read it by person, constituent, run and outcome', async () => {
  const runId = (await vgCall('createSyncRun', {}, { token: sync, body: { kind: 'vg-check', switches: {} } })).json.runId
  const a = entry({ runId })
  const b = entry({ runId, outcome: 'refused', responseStatus: 422, personId: '820002' })
  const res = await append([a, b])
  assert.equal(res.status, 200)
  assert.deepEqual(res.json, { appended: 2 })
  const byConstituent = (await read({ lglConstituentId: a.lglConstituentId })).json
  assert.equal(byConstituent.length, 1)
  assert.equal(byConstituent[0].runId, runId)
  assert.equal(typeof byConstituent[0].logId, 'string')
  assert.ok(!Number.isNaN(Date.parse(byConstituent[0].loggedAt)))
  assert.deepEqual((await read({ runId })).json.map(r => r.lglConstituentId).sort(), [a.lglConstituentId, b.lglConstituentId].sort())
  assert.ok((await read({ personId: '820002' })).json.some(r => r.lglConstituentId === b.lglConstituentId))
  const refused = (await read({ runId, outcome: ['refused'] })).json
  assert.deepEqual(refused.map(r => r.lglConstituentId), [b.lglConstituentId])
})

test('request, oldValue and newValue round-trip', async () => {
  const e = entry({
    request: { method: 'POST', path: '/constituents/77/street_addresses', body: { street: '1 Elm St\nApt 2', postal_code: '02860', is_preferred: true } },
    oldValue: { street: '9 Oak St', unit: null },
    newValue: '0',
  })
  await append([e])
  const [row] = (await read({ lglConstituentId: e.lglConstituentId })).json
  assert.deepStrictEqual(row.request, e.request)
  assert.deepStrictEqual(row.oldValue, e.oldValue)
  assert.deepStrictEqual(row.newValue, '0')
})

test('case reads back as case', async () => {
  const e = entry({ case: 'both-changed' })
  await append([e])
  const [row] = (await read({ lglConstituentId: e.lglConstituentId })).json
  assert.equal(row.case, 'both-changed')
  assert.ok(!('compareCase' in row))
})

test('an item without request is refused and nothing is written', async () => {
  const good = entry()
  const { request, ...bad } = entry()
  assert.equal((await append([good, bad])).status, 400)
  const [[{ n }]] = await withDb(db => db.query('SELECT COUNT(*) AS n FROM sync_log WHERE lglConstituentId = ?', [good.lglConstituentId]))
  assert.equal(n, 0)
})

test('staff is refused', async () => {
  assert.equal((await read({}, tokens.users.staff)).status, 403)
  assert.equal((await append([entry()], tokens.users.staff)).status, 403)
})
