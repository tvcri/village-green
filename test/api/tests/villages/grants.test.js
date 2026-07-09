import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, users } from '../../setup/fixtures.js'

// Village grant management is admin-gated: every grant op requires ?elevate=true,
// and elevate is admin-only — so a non-admin (even an owner of that village) is
// denied. (GREEN — real current behavior.)
const villageId = villages.quahog.id

test('getVillageGrants without elevate=true -> 403 (elevate is mandatory)', async () => {
  const { status } = await vgCall('getVillageGrants', { villageId }, { token: tokens.users.admin })
  assert.equal(status, 403)
})

test('getVillageGrants as a non-admin (even with elevate=true) -> 403', async () => {
  const { status } = await vgCall('getVillageGrants', { villageId, elevate: 'true' }, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('getVillageGrants as admin with elevate=true lists the village grants', async () => {
  const { status, json } = await vgCall('getVillageGrants', { villageId, elevate: 'true' }, { token: tokens.users.admin })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json) && json.length >= 1, 'Quahog has at least one grant')
})

test('createVillageGrant as a non-admin is denied', async () => {
  // Valid array body so the request clears schema validation and reaches the
  // elevate/admin gate, which must reject a non-admin caller.
  const { status } = await vgCall('createVillageGrant', { villageId, elevate: 'true' }, {
    token: tokens.users.full_v1,
    body: [{ userId: String(users.nogrants.userId), roleId: 1 }],
  })
  assert.equal(status, 403)
})
