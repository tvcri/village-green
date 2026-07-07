import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { users } from '../../setup/fixtures.js'

// Self-service user endpoints: no elevation, act on the caller's own record.
test('GET /user with no token -> 401', async () => {
  const { status } = await vgFetch('/user')
  assert.equal(status, 401)
})

test('GET /user returns the caller\'s own record', async () => {
  const { status, json } = await vgFetch('/user', { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.equal(json.username, users.full_v1.username)
})

test('GET /user reflects identity per token (admin sees admin)', async () => {
  const { json } = await vgFetch('/user', { token: tokens.users.admin })
  assert.equal(json.username, users.admin.username)
})

test('web-preferences round-trip for the caller', async () => {
  const patch = await vgFetch('/user/web-preferences', {
    token: tokens.users.full_v1, method: 'PATCH', body: { darkMode: true },
  })
  assert.equal(patch.status, 200)
  const get = await vgFetch('/user/web-preferences', { token: tokens.users.full_v1 })
  assert.equal(get.status, 200)
  assert.equal(get.json.darkMode, true)
})
