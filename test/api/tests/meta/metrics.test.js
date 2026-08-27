import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// Range 2026-06 isolates the srM* fixture rows (srV1 is 2026-07-10), matching
// test/api/tests/villages/metrics.test.js.
const RANGE = { start: '2026-06-01', end: '2026-06-30' }

test('meta metrics: a federation reader sees every village', async () => {
  const { status, json } = await vgCall('getMetaMetrics', RANGE, { token: tokens.users.board })
  assert.equal(status, 200)
  const names = json.villages.map(v => v.villageName).sort()
  assert.ok(names.includes('Quahog'), 'expected Quahog in federation scope')
  assert.ok(names.includes('Innsmouth'), 'expected Innsmouth in federation scope')
  assert.ok(names.includes('Miskatonic'), 'expected Miskatonic in federation scope')
})

test('meta metrics: a multi-village user sees exactly their granted villages', async () => {
  // multi spans Quahog + Innsmouth and is deliberately NOT granted
  // Miskatonic (see test/api/setup/fixtures.js).
  const { status, json } = await vgCall('getMetaMetrics', RANGE, { token: tokens.users.multi })
  assert.equal(status, 200)
  const names = json.villages.map(v => v.villageName).sort()
  assert.deepEqual(names, ['Innsmouth', 'Quahog'])
})

test('meta metrics: a grantless user is refused', async () => {
  const { status } = await vgCall('getMetaMetrics', RANGE, { token: tokens.users.nogrants })
  assert.equal(status, 403)
})

test('meta metrics: every cell villageId is inside the caller scope', async () => {
  const { json } = await vgCall('getMetaMetrics', RANGE, { token: tokens.users.multi })
  const scope = new Set(json.villages.map(v => v.villageId))
  for (const c of json.cells) {
    assert.ok(scope.has(c.villageId), `cell leaked village ${c.villageId}`)
  }
})

test('meta metrics: in-flight and Hub cancelled statuses never appear', async () => {
  const { json } = await vgCall('getMetaMetrics', RANGE, { token: tokens.users.board })
  // byStatus carries exactly the four terminal keys — no open/confirmed/hubCancelled.
  for (const c of json.cells) {
    assert.deepEqual(
      Object.keys(c.byStatus).sort(),
      ['completed', 'memberCancelled', 'unmatched', 'volunteerCancelled']
    )
  }
})
