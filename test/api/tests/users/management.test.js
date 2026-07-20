import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { users, villages } from '../../setup/fixtures.js'

// User / grant management (post-#56 RBAC): every op — the getUsers LIST
// included — requires user:admin / grant:admin (held only via Admin's
// federation wildcard) AND ?elevate=true. Non-admins (staff included) are 403
// even with elevate=true; admin without elevate is 403 too. Body-free probes
// keep the 403 clean (no OpenAPI body validation 400 ahead of the authz check).
//
// The admin write happy-paths run with ?keycloak=false so only the DB side is
// exercised — mockOidc has no Keycloak admin API, so any handler that reaches
// KeycloakService fails here. Only createUser HAS a ?keycloak=false escape:
// deleteUser and a username-changing PATCH/PUT (addOrUpdateUser calls
// KeycloakService.updateUsername) hit Keycloak unconditionally, so their happy
// paths are untestable until a mockOidc admin facade lands — deleteUser is a
// todo below; the PUT test keeps the username unchanged to stay off that path.
const fullV1Id = String(users.full_v1.userId)
const adminId = String(users.admin.userId)
const scratchId = String(users.scratch.userId)
const scratchVillage = String(villages.scratch.id)
const E = { elevate: 'true' }
const admin = { token: tokens.users.admin }

test('getUsers is admin+elevate only (list access is gone for non-admins)', async () => {
  const nonAdmin = await vgCall('getUsers', {}, { token: tokens.users.full_v1 })
  assert.equal(nonAdmin.status, 403, 'the old "non-admin may list" contract is gone')
  const staffElevated = await vgCall('getUsers', E, { token: tokens.users.staff })
  assert.equal(staffElevated.status, 403, 'elevate=true does not help without user:admin')
  const adminPlain = await vgCall('getUsers', {}, admin)
  assert.equal(adminPlain.status, 403, 'admin must explicitly elevate')
  const adminElevated = await vgCall('getUsers', E, admin)
  assert.equal(adminElevated.status, 200)
  assert.ok(Array.isArray(adminElevated.json))
})

test('GET /users/{id} as a non-admin -> 403 (even with elevate=true)', async () => {
  const plain = await vgCall('getUserByUserId', { userId: fullV1Id }, { token: tokens.users.full_v1 })
  assert.equal(plain.status, 403)
  const elevated = await vgCall('getUserByUserId', { userId: fullV1Id, ...E }, { token: tokens.users.full_v1 })
  assert.equal(elevated.status, 403)
})

test('DELETE /users/{id} as a non-admin -> 403', async () => {
  const { status } = await vgCall('deleteUser', { userId: adminId }, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('PATCH /users/{id} as a non-admin -> 403 (even on self)', async () => {
  // UserPatch requires a body, so this can't be body-free; a no-op same-value
  // status patch keeps a wrongly-authorized write from changing anything
  // ('available' is the seeded default).
  const { status } = await vgCall('updateUser', { userId: fullV1Id }, {
    token: tokens.users.full_v1, body: { status: 'available' },
  })
  assert.equal(status, 403)
})

test('GET /users/{id}/grants requires grant:admin -> 403 for non-admins, staff included', async () => {
  const self = await vgCall('getUserGrants', { userId: fullV1Id }, { token: tokens.users.full_v1 })
  assert.equal(self.status, 403)
  const staff = await vgCall('getUserGrants', { userId: fullV1Id, ...E }, { token: tokens.users.staff })
  assert.equal(staff.status, 403, 'staff holds every resource write but not grant:admin')
})

test('DELETE /users/{id}/grants/{grantId} as a non-admin -> 403 (no self-revoke/escalate)', async () => {
  const { status } = await vgCall('deleteUserGrant', { userId: fullV1Id, grantId: 99999 }, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('getUserGrants as admin with elevate=true lists the user\'s grants', async () => {
  const { status, json } = await vgCall('getUserGrants', { userId: fullV1Id, ...E }, admin)
  assert.equal(status, 200)
  assert.ok(Array.isArray(json))
  // full_v1's seeded grant: roleId 2 (Steering Committee) on Quahog
  const seeded = json.find(g => g.village?.villageId === String(villages.quahog.id))
  assert.ok(seeded, 'seeded Quahog grant listed')
  assert.equal(seeded.roleId, 2)
})

// ---- admin write happy paths (?keycloak=false) ----
// Ordered: later tests operate on the user the first one creates.

let createdUserId

test('createUser (keycloak=false) creates the user with role grants', async () => {
  const { status, json } = await vgCall('createUser',
    { ...E, keycloak: 'false', projection: ['grants'] }, {
      ...admin,
      body: {
        username: 'vgtest.user@scratch.test',
        roleGrants: [{ roleId: 2, villageId: scratchVillage }],
      },
    })
  assert.equal(status, 201)
  assert.ok(json.userId, 'returns a new userId')
  assert.equal(json.username, 'vgtest.user@scratch.test')
  // grants projection: object keyed by villageId, roles as DB role rows
  const granted = json.grants?.[scratchVillage]
  assert.ok(granted, 'grant created alongside the user')
  assert.deepEqual(granted.roles.map(r => r.roleId), ['2'])
  createdUserId = json.userId
})

test('createUser roleGrants must match the role\'s scope -> 422 (no user created)', async () => {
  // validateRoleGrants: federation roleIds (4-7) must have villageId null;
  // village roleIds (1-3) must carry a villageId.
  const fedWithVillage = await vgCall('createUser', { ...E, keycloak: 'false' }, {
    ...admin,
    body: { username: 'vgtest.badscope@scratch.test', roleGrants: [{ roleId: 5, villageId: scratchVillage }] },
  })
  assert.equal(fedWithVillage.status, 422, 'federation role with a villageId rejected')
  const villageWithoutId = await vgCall('createUser', { ...E, keycloak: 'false' }, {
    ...admin,
    body: { username: 'vgtest.badscope@scratch.test', roleGrants: [{ roleId: 2 }] },
  })
  assert.equal(villageWithoutId.status, 422, 'village role without a villageId rejected')
  const all = await vgCall('getUsers', E, admin)
  assert.ok(!all.json.some(u => u.username === 'vgtest.badscope@scratch.test'),
    'validation happens before the insert')
})

test('createUser with a duplicate username -> 422', async () => {
  assert.ok(createdUserId, 'precondition: create test ran')
  const { status } = await vgCall('createUser', { ...E, keycloak: 'false' }, {
    ...admin, body: { username: 'vgtest.user@scratch.test' },
  })
  assert.equal(status, 422)
})

test('createUser without elevation is denied (no user created)', async () => {
  const nonAdmin = await vgCall('createUser', { keycloak: 'false' }, {
    token: tokens.users.full_v1, body: { username: 'vgtest.denied@scratch.test' },
  })
  assert.equal(nonAdmin.status, 403)
  const adminPlain = await vgCall('createUser', { keycloak: 'false' }, {
    ...admin, body: { username: 'vgtest.denied@scratch.test' },
  })
  assert.equal(adminPlain.status, 403, 'admin without elevate=true is denied too')
})

test('getUserByUserId (admin+elevate) returns the created user', async () => {
  assert.ok(createdUserId, 'precondition: create test ran')
  const { status, json } = await vgCall('getUserByUserId', { userId: createdUserId, ...E }, admin)
  assert.equal(status, 200)
  assert.equal(json.userId, createdUserId)
  assert.equal(json.username, 'vgtest.user@scratch.test')
})

// No rename test: a username-changing PATCH/PUT always calls
// KeycloakService.updateUsername (no keycloak=false escape), which can only
// fail against mockOidc. Covered by the gap note in the README.

test('replaceUser (PUT) as admin+elevate replaces the grant set (UserPut fixed by #56)', async () => {
  // Previously RED: UserPut required `villageGrants` without declaring it
  // (additionalProperties:false), so no body could conform. The #56 grant
  // model renamed it — UserPut now requires username + roleGrants and is
  // usable. Username kept identical to stay off the Keycloak rename path.
  assert.ok(createdUserId, 'precondition: create test ran')
  const { status, json } = await vgCall('replaceUser',
    { userId: createdUserId, ...E, projection: ['grants'] }, {
      ...admin,
      body: { username: 'vgtest.user@scratch.test', roleGrants: [{ roleId: 1, villageId: scratchVillage }] },
    })
  assert.equal(status, 200)
  assert.deepEqual(json.grants?.[scratchVillage]?.roles.map(r => r.roleId), ['1'],
    'PUT replaced the role-2 grant with role 1')
})

test('patching status to unavailable clears the user\'s grants', async () => {
  // updateUser: intended status unavailable forces roleGrants/userGroups to []
  // (soft-disable revokes access); sending grants alongside it is a 422.
  assert.ok(createdUserId, 'precondition: create test ran')
  const { status, json } = await vgCall('updateUser', { userId: createdUserId, ...E }, {
    ...admin, body: { status: 'unavailable' },
  })
  assert.equal(status, 200)
  assert.equal(json.status, 'unavailable')
  const grants = await vgCall('getUserGrants', { userId: createdUserId, ...E }, admin)
  assert.equal(grants.status, 200)
  assert.equal(grants.json.length, 0, 'soft-disable revoked the village grant')
})

test('deleteUser removes a never-accessed user',
  { todo: 'blocked: deleteUser calls the Keycloak admin API unconditionally (no ?keycloak=false escape) and mockOidc has no admin API, so this 500s today' },
  async () => {
    assert.ok(createdUserId, 'precondition: create test ran')
    const del = await vgCall('deleteUser', { userId: createdUserId, ...E }, admin)
    assert.equal(del.status, 200)
    const after = await vgCall('getUserByUserId', { userId: createdUserId, ...E }, admin)
    assert.equal(after.status, 404, 'never-accessed user is hard-deleted')
  })

// ---- user grants lifecycle (scratch user; direct grants) ----

test('user grants: create -> list -> delete', async () => {
  const created = await vgCall('createUserGrant', { userId: scratchId, ...E }, {
    ...admin, body: [{ villageId: scratchVillage, roleId: 1 }],
  })
  assert.equal(created.status, 201)

  // rows are {grantId, roleId, village: {villageId, name} | null (federation), grantees: [...]}
  const listed = await vgCall('getUserGrants', { userId: scratchId, ...E }, admin)
  assert.equal(listed.status, 200)
  const mine = listed.json.find(g => g.village?.villageId === scratchVillage)
  assert.ok(mine, 'created grant is listed')
  assert.equal(mine.roleId, 1)

  const del = await vgCall('deleteUserGrant', { userId: scratchId, grantId: mine.grantId, ...E }, admin)
  assert.equal(del.status, 200)
  const after = await vgCall('getUserGrants', { userId: scratchId, ...E }, admin)
  assert.ok(!after.json.some(g => g.village?.villageId === scratchVillage), 'grant removed')
})
