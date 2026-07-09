import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { serviceRequests as sr } from '../../setup/fixtures.js'

// villages that actually have service requests (excludes the data-less scratch village)
const allVillageIds = [...new Set(Object.values(sr).map(r => String(r.villageId)))]

test('non-admin cannot elevate -> 403', async () => {
  const { status } = await vgCall('getServiceRequests', { elevate: 'true' }, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('admin with elevate=true sees all villages', async () => {
  const { status, json } = await vgCall('getServiceRequests', { elevate: 'true' }, { token: tokens.users.admin })
  assert.equal(status, 200)
  const srIds = json.map(r => r.serviceRequestId)
  for (const id of [sr.srV1.id, sr.srV2.id, sr.srV3.id]) {
    assert.ok(srIds.includes(String(id)), `elevated admin should see service request ${id}`)
  }
  const villageIds = new Set(json.map(r => r.villageId))
  for (const vid of allVillageIds) assert.ok(villageIds.has(vid), `should span village ${vid}`)
})

test('admin without elevate is not implicitly omniscient (sees only granted = none)', async () => {
  const { status, json } = await vgCall('getServiceRequests', {}, { token: tokens.users.admin })
  assert.equal(status, 200)
  assert.equal(json.length, 0)
})
