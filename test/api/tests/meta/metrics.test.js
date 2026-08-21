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
