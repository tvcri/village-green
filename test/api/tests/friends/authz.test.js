import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// GET /friends (FCV submissions) is IMPLEMENTED (FriendService.getFriends).
// These assert the auth/scope gate — real, current behavior (GREEN).
// Post-#56 a village-scope user must pass villageId ⊆ granted villages: every
// filtered village needs friend:read there, and NO filter means a
// federation-wide query, which needs a federation-scope read.

test('GET /friends with no token -> 401', async () => {
  const { status } = await vgCall('getFriends')
  assert.equal(status, 401)
})

test('GET /friends with a valid token lacking vg:friends scope -> 403', async () => {
  // readOnly carries service-request/village/person read scopes only — no friends scope.
  const { status } = await vgCall('getFriends', {}, { token: tokens.special.readOnly })
  assert.equal(status, 403)
})

test('GET /friends with a granted villageId -> 200 returns an array', async () => {
  const { status, json } = await vgCall('getFriends',
    { villageId: [String(villages.quahog.id)] }, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json))
})

test('village user with NO villageId filter -> 403 (no filter = federation-wide query)', async () => {
  const { status } = await vgCall('getFriends', {}, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('village user filtering an UNgranted village -> 403 (not an empty list)', async () => {
  const { status } = await vgCall('getFriends',
    { villageId: [String(villages.innsmouth.id)] }, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('any ungranted villageId in a mixed filter poisons the whole request -> 403', async () => {
  const { status } = await vgCall('getFriends',
    { villageId: [String(villages.quahog.id), String(villages.miskatonic.id)] },
    { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('nogrants user -> 403 with or without a villageId filter', async () => {
  const plain = await vgCall('getFriends', {}, { token: tokens.users.nogrants })
  assert.equal(plain.status, 403)
  const filtered = await vgCall('getFriends',
    { villageId: [String(villages.quahog.id)] }, { token: tokens.users.nogrants })
  assert.equal(filtered.status, 403)
})
