import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { serviceRequests as sr } from '../../setup/fixtures.js'

// serviceDateStart/serviceDateEnd are inclusive bounds on a wall-clock civil
// date, compared as plain 'YYYY-MM-DD' strings.
// Fixtures: srV1 2026-07-10, srV2 2026-07-11, srV3 2026-07-12.
const idsOf = (rows) => rows.map(r => r.serviceRequestId)

test('omitting serviceDateStart is a 400', async () => {
  const { status } = await vgCall('getServiceRequests', {}, { token: tokens.users.admin })
  assert.equal(status, 400)
})

test('serviceDateStart is an inclusive lower bound', async () => {
  const { status, json } = await vgCall('getServiceRequests',
    { serviceDateStart: '2026-07-11' }, { token: tokens.users.admin })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok(ids.includes(String(sr.srV2.id)), 'boundary date must be included')
  assert.ok(ids.includes(String(sr.srV3.id)))
  assert.ok(!ids.includes(String(sr.srV1.id)), '2026-07-10 is before the window')
})

test('serviceDateEnd is an inclusive upper bound', async () => {
  const { status, json } = await vgCall('getServiceRequests',
    { serviceDateStart: '2000-01-01', serviceDateEnd: '2026-07-11' },
    { token: tokens.users.admin })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok(ids.includes(String(sr.srV1.id)))
  assert.ok(ids.includes(String(sr.srV2.id)), 'boundary date must be included')
  assert.ok(!ids.includes(String(sr.srV3.id)), '2026-07-12 is after the window')
})

test('omitting serviceDateEnd applies no upper bound', async () => {
  const { status, json } = await vgCall('getServiceRequests',
    { serviceDateStart: '2000-01-01' }, { token: tokens.users.admin })
  assert.equal(status, 200)
  const ids = idsOf(json)
  for (const s of [sr.srV1, sr.srV2, sr.srV3]) {
    assert.ok(ids.includes(String(s.id)), `request ${s.id} must be returned`)
  }
})

test('village SR list accepts the same date params and returns the full column set', async () => {
  const { status, json } = await vgCall('getVillageServiceRequests',
    { villageId: String(sr.srV1.villageId), serviceDateStart: '2000-01-01' },
    { token: tokens.users.admin })
  assert.equal(status, 200)
  assert.ok(json.length > 0, 'precondition: village has fixtures')
  // Regression: VillageService used to omit sr.state, emptying the CSV column.
  assert.ok('state' in json[0], 'state column must be present')
  assert.ok('villageName' in json[0], 'delegation must supply villageName')
  assert.ok('vssSignup' in json[0])
})

test('village SR list honours the date window', async () => {
  const { status, json } = await vgCall('getVillageServiceRequests',
    { villageId: String(sr.srV1.villageId), serviceDateStart: '2026-07-11' },
    { token: tokens.users.admin })
  assert.equal(status, 200)
  assert.ok(!idsOf(json).includes(String(sr.srV1.id)),
    'srV1 (2026-07-10) is before the window')
})
