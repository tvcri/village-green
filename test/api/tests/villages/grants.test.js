import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, users } from '../../setup/fixtures.js'

// Village grant management is admin-gated: every op on /villages/{id}/grants
// requires grant:admin (held only by admin's wildcard) plus ?elevate=true, so
// a non-admin — even a lead of that village — is denied. The gate fires BEFORE
// the village existence lookup, so only an elevated admin can learn 404.
// Grant-write happy paths live in grants-write.test.js (scratch village); the
// group-grant flow (role_grant.userGroupId -> member users) is exercised in
// users/groups.test.js.
const villageId = villages.quahog.id

test('getVillageGrants without elevate=true -> 403 (elevate is mandatory)', async () => {
  const { status } = await vgCall('getVillageGrants', { villageId }, { token: tokens.users.admin })
  assert.equal(status, 403)
})

test('getVillageGrants as a non-admin (even with elevate=true) -> 403', async () => {
  const { status } = await vgCall('getVillageGrants', { villageId, elevate: 'true' }, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('getVillageGrants as staff (elevate=true) -> 403 (grant:admin is admin-only)', async () => {
  const { status } = await vgCall('getVillageGrants', { villageId, elevate: 'true' }, { token: tokens.users.staff })
  assert.equal(status, 403)
})

test('getVillageGrants as admin with elevate=true lists the village grants', async () => {
  const { status, json } = await vgCall('getVillageGrants', { villageId, elevate: 'true' }, { token: tokens.users.admin })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json) && json.length >= 1, 'Quahog has at least one grant')
})

test('getVillageGrants gate precedes existence: 403 unelevated, 404 only for admin+elevate', async () => {
  const gated = await vgCall('getVillageGrants', { villageId: 999999, elevate: 'true' }, { token: tokens.users.full_v1 })
  assert.equal(gated.status, 403, 'non-admin cannot learn whether the village exists')

  const missing = await vgCall('getVillageGrants', { villageId: 999999, elevate: 'true' }, { token: tokens.users.admin })
  assert.equal(missing.status, 404)
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
