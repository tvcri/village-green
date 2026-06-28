import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../lib/client.js'
import { tokens } from '../lib/context.js'
import { villages, serviceRequests as sr } from '../setup/fixtures.js'

const SR = '/service-requests'
const allVillageIds = Object.values(villages).map(v => String(v.id))

test('non-admin cannot elevate -> 403', async () => {
  const { status } = await vgFetch(SR, { token: tokens.users.full_v1, query: { elevate: 'true' } })
  assert.equal(status, 403)
})

test('admin with elevate=true sees all villages', async () => {
  const { status, json } = await vgFetch(SR, { token: tokens.users.admin, query: { elevate: 'true' } })
  assert.equal(status, 200)
  const srIds = json.map(r => r.serviceRequestId)
  for (const id of [sr.srV1.id, sr.srV2.id, sr.srV3.id]) {
    assert.ok(srIds.includes(String(id)), `elevated admin should see service request ${id}`)
  }
  const villageIds = new Set(json.map(r => r.villageId))
  for (const vid of allVillageIds) assert.ok(villageIds.has(vid), `should span village ${vid}`)
})

test('admin without elevate is not implicitly omniscient (sees only granted = none)', async () => {
  const { status, json } = await vgFetch(SR, { token: tokens.users.admin })
  assert.equal(status, 200)
  assert.equal(json.length, 0)
})
