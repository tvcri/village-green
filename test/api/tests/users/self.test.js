import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { users, villages } from '../../setup/fixtures.js'

// Self-service user endpoints: no elevation, act on the caller's own record.
// Post-#56, GET /user always projects grants/statistics/privacyStatus and adds
// canElevate — access data is DB-derived (role_grant), not token claims.
test('GET /user with no token -> 401', async () => {
  const { status } = await vgCall('getUser')
  assert.equal(status, 401)
})

test('GET /user returns the caller\'s own record with DB-derived grants', async () => {
  const { status, json } = await vgCall('getUser', {}, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.equal(json.username, users.full_v1.username)
  assert.equal(json.canElevate, false, 'only user:admin holders can elevate')
  const vid = String(villages.quahog.id)
  assert.ok(json.grants?.[vid], 'seeded village grant projected by villageId')
  assert.deepEqual(json.grants[vid].roles.map(r => r.roleId), ['2'], 'role 2 Steering Committee')
  assert.ok(json.permissions?.byVillage?.[vid]?.includes('person:read'), 'per-village permission bundle')
  assert.equal(json.permissions.federation.length, 0, 'village user holds no federation permissions')
  // #68 (multi-volunteer household accounts): the singular `volunteer` block
  // became a `volunteers` array — empty when no resolved person behind the
  // username is an active volunteer (fixture usernames match no person email).
  assert.deepEqual(json.volunteers, [], 'no active-volunteer persons resolve from this username')
})

test('GET /user reflects identity per token (admin sees admin, canElevate=true)', async () => {
  const { json } = await vgCall('getUser', {}, { token: tokens.users.admin })
  assert.equal(json.username, users.admin.username)
  assert.equal(json.canElevate, true, 'the admin wildcard covers the elevatable permissions')
  assert.ok(json.permissions?.federation?.includes('*'), 'admin is a federation wildcard grant')
})

test('web-preferences round-trip for the caller', async () => {
  const patch = await vgCall('patchUserWebPreferences', {}, {
    token: tokens.users.full_v1, body: { darkMode: true },
  })
  assert.equal(patch.status, 200)
  const get = await vgCall('getUserWebPreferences', {}, { token: tokens.users.full_v1 })
  assert.equal(get.status, 200)
  assert.equal(get.json.darkMode, true)
})
