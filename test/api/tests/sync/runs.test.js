import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'

// Runs: one row per full pass, and per check that did something.
const sync = tokens.users.sync
const start = (body, token = sync) => vgCall('createSyncRun', {}, { token, body })
const patch = (runId, body, token = sync) => vgCall('patchSyncRun', { runId }, { token, body })
const list = (query = {}, token = sync) => vgCall('getSyncRuns', query, { token })
const switches = { writeVg: true, writeLgl: false }

test('start returns a running run', async () => {
  const res = await start({ kind: 'full', switches, imageRevision: 'abc1234', policyHash: 'deadbeef' })
  assert.equal(res.status, 200)
  assert.equal(typeof res.json.runId, 'string')
  assert.equal(res.json.result, 'running')
  assert.equal(res.json.kind, 'full')
  assert.deepEqual(res.json.switches, switches)
  assert.ok(!Number.isNaN(Date.parse(res.json.startedAt)))
  assert.equal(res.json.finishedAt, null)
})

test('finish sets result, counts, cursors and finishedAt', async () => {
  const { json: run } = await start({ kind: 'vg-check', switches })
  const counts = { compared: 12, toVg: 1, holdsOpened: 0, byCase: { same: 11, 'lgl-changed': 1 } }
  const res = await patch(run.runId, {
    result: 'ok', counts, lglCursor: '2026-11-11T21:04:05.123Z', vgCursor: 9007199254740,
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.result, 'ok')
  assert.deepEqual(res.json.counts, counts)
  assert.equal(res.json.vgCursor, 9007199254740)
  assert.equal(res.json.lglCursor, '2026-11-11T21:04:05.123Z')
  assert.ok(res.json.finishedAt)
})

test('a failed run keeps its error', async () => {
  const { json: run } = await start({ kind: 'lgl-check', switches })
  const res = await patch(run.runId, { result: 'failed', error: 'LGL 503 on constituents search' })
  assert.equal(res.status, 200)
  assert.equal(res.json.error, 'LGL 503 on constituents search')
})

test('patching a finished run is 409', async () => {
  const { json: run } = await start({ kind: 'full', switches })
  assert.equal((await patch(run.runId, { result: 'ok' })).status, 200)
  assert.equal((await patch(run.runId, { counts: { late: 1 } })).status, 409)
})

test('a result finishes the run; progress without one does not', async () => {
  const { json: run } = await start({ kind: 'full', switches })
  const mid = await patch(run.runId, { counts: { compared: 3 }, vgCursor: 42 })
  assert.equal(mid.status, 200)
  assert.equal(mid.json.result, 'running')
  assert.equal(mid.json.finishedAt, null)
  const done = await patch(run.runId, { result: 'ok' })
  assert.equal(done.json.result, 'ok')
  assert.ok(done.json.finishedAt, 'finishedAt is set with the result')
})

test('a run cannot be set back to running, and finished is not a field', async () => {
  const { json: run } = await start({ kind: 'full', switches })
  assert.equal((await patch(run.runId, { result: 'running' })).status, 400)
  assert.equal((await patch(run.runId, { finished: true })).status, 400)
})

test('unknown runId is 404', async () => {
  assert.equal((await patch('2147483000', { result: 'ok' })).status, 404)
})

test('list filters by kind and since and is newest first', async () => {
  const since = new Date(Date.now() - 1000).toISOString()
  const a = (await start({ kind: 'lgl-check', switches })).json
  const b = (await start({ kind: 'lgl-check', switches })).json
  await start({ kind: 'vg-check', switches })
  const res = await list({ kind: ['lgl-check'], since })
  assert.equal(res.status, 200)
  assert.ok(res.json.every(r => r.kind === 'lgl-check'))
  const ids = res.json.map(r => r.runId)
  assert.ok(ids.indexOf(b.runId) < ids.indexOf(a.runId), 'newest first')
  assert.equal((await list({ limit: 1 })).json.length, 1)
})

test('staff is refused', async () => {
  const staff = tokens.users.staff
  assert.equal((await list({}, staff)).status, 403)
  assert.equal((await start({ kind: 'full', switches }, staff)).status, 403)
  assert.equal((await patch('1', { result: 'ok' }, staff)).status, 403)
})
