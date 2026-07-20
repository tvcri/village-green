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
  const declared = ops.operationMap.get('getVillage').params.projection.schema.items.enum
  assert.deepEqual(declared.toSorted(),
    ['capabilityCounts', 'grants', 'personCounts', 'srStatusCounts', 'statistics'])
})

test('village projections expand the village by id', async () => {
  // statistics included: the by-id path builds its grantees CTE without a
  // villageId IN-list (allVillages), so the pre-#56 500 is fixed here (#56).
  for (const p of ['capabilityCounts', 'grants', 'personCounts', 'srStatusCounts', 'statistics']) {
    const { status, json } = await vgCall('getVillage',
      { villageId: villages.quahog.id, projection: [p] },
      { token: tokens.users.full_v1 })
    assert.equal(status, 200, `village projection ${p} status`)
    assert.ok(p in json, `${p} projected`)
  }
})

test('list projection=statistics works for federation and single-village callers', async () => {
  const adm = await vgCall('getVillages', { projection: ['statistics'] }, { token: tokens.users.admin })
  assert.equal(adm.status, 200)
  assert.ok(adm.json.length && adm.json.every(v => 'statistics' in v), 'admin gets statistics per village')

  // A single-village caller also works — but only accidentally: its one-entry
  // grant list dodges the IN-list bug pinned RED below.
  const one = await vgCall('getVillages', { projection: ['statistics'] }, { token: tokens.users.full_v1 })
  assert.equal(one.status, 200)
  assert.ok(one.json.length && one.json.every(v => 'statistics' in v), 'single-village caller gets statistics')
})

test('list projection=statistics works for a multi-village caller (RED until fixed)', async () => {
  // RED — scratch/bug-report-2026-07-20.md (bug 1): sqlGrantees double-wraps
  // villageIds (api/source/service/utils.js:754), so the grantees CTE renders
  // `cg.villageId IN ((1, 2))` whenever the caller's grant list has >= 2
  // entries -> ER_OPERAND_COLUMNS -> 500 today. Federation callers
  // (allVillages path) and single-village callers dodge it. This asserts the
  // CORRECT behavior and goes green with no edit when the fix lands.
  const { status, json } = await vgCall('getVillages', { projection: ['statistics'] }, { token: tokens.users.multi })
  assert.equal(status, 200)
  assert.ok(json.length === 2 && json.every(v => 'statistics' in v),
    'multi-village caller gets statistics for both granted villages')
})
