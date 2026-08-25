import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { users, taskUsers } from '../../setup/fixtures.js'

// Each `?projection=` option expands the response with extra data. Post-#56 the
// user enum is grants/statistics/privacyStatus/userGroups/webPreferences/
// volunteer — the old villageGrants projection is gone. Admin-gating of the
// whole getUsers endpoint is asserted in management.test.js.

test('users projection=grants expands the effective-permission triple (admin+elevate)', async () => {
  const { status, json } = await vgCall('getUsers',
    { elevate: 'true', projection: ['grants'] },
    { token: tokens.users.admin })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json) && json.length > 0)
  // 'grants' projects the same shape setupUser computes at auth time:
  // grants (by villageId) + federationGrants + permissions.
  assert.ok('grants' in json[0], 'grants projected per user')
  assert.ok('federationGrants' in json[0], 'federationGrants projected per user')
  assert.ok('permissions' in json[0], 'permissions projected per user')
  const adminRow = json.find(u => u.username === users.admin.username)
  assert.ok(adminRow.permissions.federation.includes('*'), 'admin row carries the federation wildcard')
})

test('GET /user projection=webPreferences expands web preferences', async () => {
  const { status, json } = await vgCall('getUser', { projection: ['webPreferences'] }, {
    token: tokens.users.full_v1,
  })
  assert.equal(status, 200)
  assert.ok('webPreferences' in json, 'webPreferences projected')
})

// Task users (0024) are actor rows for scheduled work, not members of the
// administered user collection. getUsers excludes them so the admin table,
// its count and its export carry humans only; the by-id/by-username lookups
// that share queryUsers must still resolve them.

test('getUsers excludes task users from the collection', async () => {
  const { status, json } = await vgCall('getUsers',
    { elevate: 'true' },
    { token: tokens.users.admin })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json) && json.length > 0)
  assert.ok(
    !json.some(u => u.username === taskUsers.autoComplete.username),
    'the auto_complete task user is not in the collection')
  assert.ok(
    json.some(u => u.username === users.admin.username),
    'human users are still returned')
})

test('getUsers excludes task users under an explicit status filter too', async () => {
  // The task row is seeded 'unavailable'; asking for unavailable users must
  // not bring it back, or the exclusion would be trivially bypassable and a
  // future show-unavailable toggle would resurface it.
  const { status, json } = await vgCall('getUsers',
    { elevate: 'true', status: 'unavailable' },
    { token: tokens.users.admin })
  assert.equal(status, 200)
  assert.ok(
    !json.some(u => u.username === taskUsers.autoComplete.username),
    'status=unavailable does not resurface the task user')
})

test('getUserByUserId still resolves a task user by id', async () => {
  // Excluding from the collection must not make the actor row unfetchable:
  // deleteUser and the by-id lookups share queryUsers.
  const { status, json } = await vgCall('getUserByUserId',
    { userId: String(taskUsers.autoComplete.userId), elevate: 'true' },
    { token: tokens.users.admin })
  assert.equal(status, 200)
  assert.equal(json.username, taskUsers.autoComplete.username)
})
