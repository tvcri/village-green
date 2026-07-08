import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall, ops } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// Each `?projection=` option expands the village with extra data. Exercised in
// an authorized (own-village) context; read grant-gating is in read.test.js.

test('the spec declares exactly the village projections exercised here', () => {
  // Drift tripwire: if a new projection lands in the OAS, this fails and names
  // it — add coverage below (and to the sets in the tests) rather than let it
  // ship unexercised.
  // (It already earned its keep: on its first run it flagged capabilityCounts,
  // grants, and srStatusCounts as declared-but-unexercised.)
  const declared = ops.operationMap.get('getVillage').params.projection.schema.items.enum
  assert.deepEqual(declared.toSorted(),
    ['capabilityCounts', 'grants', 'owners', 'personCounts', 'srStatusCounts', 'statistics'])
})

test('village projections expand the village (all but the broken statistics)', async () => {
  for (const p of ['owners', 'personCounts', 'capabilityCounts', 'grants', 'srStatusCounts']) {
    const { status, json } = await vgCall('getVillage',
      { villageId: villages.quahog.id, projection: [p] },
      { token: tokens.users.full_v1 })
    assert.equal(status, 200, `village projection ${p} status`)
    assert.ok(p in json, `${p} projected`)
  }
})

test('village projection=statistics expands village statistics',
  { todo: 'the village `statistics` projection 500s on a SQL syntax error' }, async () => {
    const { status, json } = await vgCall('getVillage',
      { villageId: villages.quahog.id, projection: ['statistics'] },
      { token: tokens.users.full_v1 })
    assert.equal(status, 200)
    assert.ok('statistics' in json, 'statistics projected')
  })
