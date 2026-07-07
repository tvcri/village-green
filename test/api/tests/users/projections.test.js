import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'

// Each `?projection=` option expands the response with extra data. Admin-gating
// of the villageGrants projection is asserted in management.test.js.

test('users projection=villageGrants expands each user (admin+elevate)', async () => {
  const { status, json } = await vgFetch('/users', {
    token: tokens.users.admin, query: { elevate: 'true', projection: ['villageGrants'] },
  })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json) && json.length > 0)
  assert.ok('villageGrants' in json[0], 'villageGrants projected per user')
})

test('GET /user projection=webPreferences expands web preferences', async () => {
  const { status, json } = await vgFetch('/user', {
    token: tokens.users.full_v1, query: { projection: ['webPreferences'] },
  })
  assert.equal(status, 200)
  assert.ok('webPreferences' in json, 'webPreferences projected')
})
