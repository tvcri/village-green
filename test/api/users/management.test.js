import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../lib/client.js'
import { tokens } from '../lib/context.js'
import { users } from '../setup/fixtures.js'

// User / grant management is admin-gated: every op requires ?elevate=true and
// elevate is admin-only, so a non-admin is denied. (GREEN.) Body-free probes
// keep the 403 clean (no OpenAPI body validation 400 ahead of the authz check).
const fullV1Id = String(users.full_v1.userId)
const adminId = String(users.admin.userId)

test('GET /users/{id} as a non-admin -> 403', async () => {
  const { status } = await vgFetch(`/users/${fullV1Id}`, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('DELETE /users/{id} as a non-admin -> 403', async () => {
  const { status } = await vgFetch(`/users/${adminId}`, { token: tokens.users.full_v1, method: 'DELETE' })
  assert.equal(status, 403)
})

test('GET /users/{id}/grants as a non-admin -> 403', async () => {
  const { status } = await vgFetch(`/users/${fullV1Id}/grants`, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('DELETE /users/{id}/grants/{grantId} as a non-admin -> 403 (no self-revoke/escalate)', async () => {
  const { status } = await vgFetch(`/users/${fullV1Id}/grants/99999`, { token: tokens.users.full_v1, method: 'DELETE' })
  assert.equal(status, 403)
})

test('getUserGrants as admin with elevate=true lists the user\'s grants', async () => {
  const { status, json } = await vgFetch(`/users/${fullV1Id}/grants`, {
    token: tokens.users.admin, query: { elevate: 'true' },
  })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json))
})

test('getUsers: non-admin may list, but a projection requires elevation', async () => {
  const list = await vgFetch('/users', { token: tokens.users.full_v1 })
  assert.equal(list.status, 200)
  assert.ok(Array.isArray(list.json))

  const projected = await vgFetch('/users', { token: tokens.users.full_v1, query: { projection: ['villageGrants'] } })
  assert.equal(projected.status, 403)
})
