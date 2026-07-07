import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { users, villages } from '../../setup/fixtures.js'

// User / grant management is admin-gated: every op requires ?elevate=true and
// elevate is admin-only, so a non-admin is denied. (GREEN.) Body-free probes
// keep the 403 clean (no OpenAPI body validation 400 ahead of the authz check).
//
// The admin write happy-paths run with ?keycloak=false so only the DB side is
// exercised — mockOidc has no Keycloak admin API, so any handler that reaches
// KeycloakService fails here. Only createUser HAS a ?keycloak=false escape:
// deleteUser and a username-changing PATCH/PUT (UserService.replaceUser calls
// KeycloakService.updateUsername) hit Keycloak unconditionally, so their happy
// paths are untestable until a mockOidc admin facade lands — deleteUser is a
// todo below; the rename path has no test at all.
const fullV1Id = String(users.full_v1.userId)
const adminId = String(users.admin.userId)
const scratchId = String(users.scratch.userId)
const scratchVillage = String(villages.scratch.id)
const A = { token: tokens.users.admin, query: { elevate: 'true' } }

test('GET /users/{id} as a non-admin -> 403', async () => {
  const { status } = await vgFetch(`/users/${fullV1Id}`, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('DELETE /users/{id} as a non-admin -> 403', async () => {
  const { status } = await vgFetch(`/users/${adminId}`, { token: tokens.users.full_v1, method: 'DELETE' })
  assert.equal(status, 403)
})

test('PATCH /users/{id} as a non-admin -> 403 (even on self)', async () => {
  // UserPatch requires a body, so this can't be body-free; a no-op same-value
  // status patch keeps a wrongly-authorized write from changing anything
  // ('available' is the seeded default).
  const { status } = await vgFetch(`/users/${fullV1Id}`, {
    token: tokens.users.full_v1, method: 'PATCH', body: { status: 'available' },
  })
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

// ---- admin write happy paths (?keycloak=false) ----
// Ordered: later tests operate on the user the first one creates.

let createdUserId

test('createUser (keycloak=false) creates the user with village grants', async () => {
  const { status, json } = await vgFetch('/users', {
    token: tokens.users.admin,
    query: { elevate: 'true', keycloak: 'false', projection: ['villageGrants'] },
    body: {
      username: 'vgtest.user@scratch.test',
      villageGrants: [{ villageId: scratchVillage, roleId: 2 }],
    },
  })
  assert.equal(status, 201)
  assert.ok(json.userId, 'returns a new userId')
  assert.equal(json.username, 'vgtest.user@scratch.test')
  assert.equal(json.villageGrants?.length, 1, 'grant created alongside the user')
  createdUserId = json.userId
})

test('createUser with a duplicate username -> 422', async () => {
  assert.ok(createdUserId, 'precondition: create test ran')
  const { status } = await vgFetch('/users', {
    token: tokens.users.admin, query: { elevate: 'true', keycloak: 'false' },
    body: { username: 'vgtest.user@scratch.test' },
  })
  assert.equal(status, 422)
})

test('createUser without elevation is denied (no user created)', async () => {
  const { status } = await vgFetch('/users', {
    token: tokens.users.full_v1, query: { keycloak: 'false' },
    body: { username: 'vgtest.denied@scratch.test' },
  })
  assert.equal(status, 403)
})

test('getUserByUserId (admin+elevate) returns the created user', async () => {
  assert.ok(createdUserId, 'precondition: create test ran')
  const { status, json } = await vgFetch(`/users/${createdUserId}`, A)
  assert.equal(status, 200)
  assert.equal(json.userId, createdUserId)
  assert.equal(json.username, 'vgtest.user@scratch.test')
})

// No rename test: a username-changing PATCH always calls
// KeycloakService.updateUsername (no keycloak=false escape), which can only
// fail against mockOidc. Covered by the gap note in the README.

test('replaceUser (PUT) is unusable: UserPut both requires and forbids villageGrants', async () => {
  // SPEC BUG (characterized): UserPut lists `villageGrants` as required but not
  // among its properties, and sets additionalProperties:false — so no body can
  // conform. Omitting it fails `required`; sending it fails additionalProperties.
  assert.ok(createdUserId, 'precondition: create test ran')
  const without = await vgFetch(`/users/${createdUserId}`, {
    ...A, method: 'PUT', body: { username: 'vgtest.renamed@scratch.test' },
  })
  assert.equal(without.status, 400, 'missing required villageGrants')
  const withGrants = await vgFetch(`/users/${createdUserId}`, {
    ...A, method: 'PUT',
    body: { username: 'vgtest.renamed@scratch.test', villageGrants: [{ villageId: scratchVillage, roleId: 2 }] },
  })
  assert.equal(withGrants.status, 400, 'villageGrants rejected as an unknown property')
})

test('patching status to unavailable clears the user\'s grants', async () => {
  assert.ok(createdUserId, 'precondition: create test ran')
  const { status, json } = await vgFetch(`/users/${createdUserId}`, {
    ...A, method: 'PATCH', body: { status: 'unavailable' },
  })
  assert.equal(status, 200)
  assert.equal(json.status, 'unavailable')
  const grants = await vgFetch(`/users/${createdUserId}/grants`, A)
  assert.equal(grants.status, 200)
  assert.equal(grants.json.length, 0, 'soft-disable revoked the village grant')
})

test('deleteUser removes a never-accessed user',
  { todo: 'blocked: deleteUser calls the Keycloak admin API unconditionally (no ?keycloak=false escape) and mockOidc has no admin API, so this 500s today' },
  async () => {
    assert.ok(createdUserId, 'precondition: create test ran')
    const del = await vgFetch(`/users/${createdUserId}`, { ...A, method: 'DELETE' })
    assert.equal(del.status, 200)
    const after = await vgFetch(`/users/${createdUserId}`, A)
    assert.equal(after.status, 404, 'never-accessed user is hard-deleted')
  })

// ---- user grants lifecycle (scratch user; direct grants) ----

test('user grants: create -> list -> delete', async () => {
  const created = await vgFetch(`/users/${scratchId}/grants`, {
    ...A, body: [{ villageId: scratchVillage, roleId: 1 }],
  })
  assert.equal(created.status, 201)

  // rows are {grantId, roleId, village: {villageId, name}, grantees: [...]}
  const listed = await vgFetch(`/users/${scratchId}/grants`, A)
  assert.equal(listed.status, 200)
  const mine = listed.json.find(g => g.village?.villageId === scratchVillage)
  assert.ok(mine, 'created grant is listed')
  assert.equal(mine.roleId, 1)

  const del = await vgFetch(`/users/${scratchId}/grants/${mine.grantId}`, { ...A, method: 'DELETE' })
  assert.equal(del.status, 200)
  const after = await vgFetch(`/users/${scratchId}/grants`, A)
  assert.ok(!after.json.some(g => g.village?.villageId === scratchVillage), 'grant removed')
})
