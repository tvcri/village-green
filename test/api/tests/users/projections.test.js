import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { users } from '../../setup/fixtures.js'

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
