import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { users } from '../../setup/fixtures.js'

// Self-service user endpoints: no elevation, act on the caller's own record.
test('GET /user with no token -> 401', async () => {
  const { status } = await vgCall('getUser')
  assert.equal(status, 401)
})

test('GET /user returns the caller\'s own record', async () => {
  const { status, json } = await vgCall('getUser', {}, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.equal(json.username, users.full_v1.username)
})

test('GET /user reflects identity per token (admin sees admin)', async () => {
  const { json } = await vgCall('getUser', {}, { token: tokens.users.admin })
  assert.equal(json.username, users.admin.username)
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
