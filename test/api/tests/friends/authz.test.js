import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'

// GET /friends (FCV submissions) is IMPLEMENTED (FriendService.getFriends).
// These assert the auth/scope gate — real, current behavior (GREEN).

test('GET /friends with no token -> 401', async () => {
  const { status } = await vgCall('getFriends')
  assert.equal(status, 401)
})

test('GET /friends with a valid token lacking vg:friends scope -> 403', async () => {
  // readOnly carries service-request/village/person read scopes only — no friends scope.
  const { status } = await vgCall('getFriends', {}, { token: tokens.special.readOnly })
  assert.equal(status, 403)
})

test('GET /friends with full scope -> 200 returns an array', async () => {
  const { status, json } = await vgCall('getFriends', {}, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json))
})
