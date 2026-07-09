import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { users, villages } from '../../setup/fixtures.js'

// User groups: admin-gated CRUD (?elevate=true), non-admin reads, and the
// grants-via-group path — a village grant assigned to a userGroupId (via
// POST /villages/{id}/grants) flows to the group's member users. Uses the
// scratch user + scratch village throughout, and cleans up (grants cleared,
// group deleted) so the canonical fixtures and later files see no residue.
//
// Note the group-grant WRITE path: UserGroupPostOrPut has no villageGrants
// property, so grants ride on the village-grants endpoints' userGroupId
// variant, not on the group document itself.
const scratchId = String(users.scratch.userId)
const scratchVillage = String(villages.scratch.id)
const E = { elevate: 'true' }
const admin = { token: tokens.users.admin }

let groupId // set by the create test; later tests in this file depend on it

test('createUserGroup without elevation is denied', async () => {
  const { status } = await vgCall('createUserGroup', {}, {
    token: tokens.users.full_v1, body: { name: 'Probe Group' },
  })
  assert.equal(status, 403)
})

test('createUserGroup (admin+elevate) creates a group with member users', async () => {
  const { status, json } = await vgCall('createUserGroup', { ...E, projection: ['users'] }, {
    ...admin,
    body: { name: 'Pawtuxet Crew', description: 'scratch test group', userIds: [scratchId] },
  })
  assert.equal(status, 201)
  assert.ok(json.userGroupId, 'returns a new userGroupId')
  assert.equal(json.name, 'Pawtuxet Crew')
  assert.ok(json.users?.some(u => u.userId === scratchId), 'scratch user is a member')
  groupId = json.userGroupId
})

test('createUserGroup with an unknown member userId -> 422', async () => {
  const { status } = await vgCall('createUserGroup', E, {
    ...admin, body: { name: 'Ghost Crew', userIds: ['999999'] },
  })
  assert.equal(status, 422)
})

test('user groups are listable without elevation (vg:user:read)', async () => {
  assert.ok(groupId, 'precondition: create test ran')
  const { status, json } = await vgCall('getUserGroups', {}, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.ok(json.some(g => g.userGroupId === groupId), 'any authenticated reader sees the group')

  const byId = await vgCall('getUserGroup', { userGroupId: groupId }, { token: tokens.users.full_v1 })
  assert.equal(byId.status, 200)
  assert.equal(byId.json.name, 'Pawtuxet Crew')
})

test('the villages projection requires elevation', async () => {
  const { status } = await vgCall('getUserGroups', { projection: ['villages'] }, {
    token: tokens.users.full_v1,
  })
  assert.equal(status, 403)
})

test('patchUserGroup renames and replaces the membership set', async () => {
  assert.ok(groupId, 'precondition: create test ran')
  const emptied = await vgCall('patchUserGroup', { userGroupId: groupId, ...E, projection: ['users'] }, {
    ...admin, body: { name: 'Pawtuxet Night Crew', userIds: [] },
  })
  assert.equal(emptied.status, 200)
  assert.equal(emptied.json.name, 'Pawtuxet Night Crew')
  assert.equal(emptied.json.users?.length ?? 0, 0, 'membership cleared')

  const restored = await vgCall('patchUserGroup', { userGroupId: groupId, ...E, projection: ['users'] }, {
    ...admin, body: { userIds: [scratchId] },
  })
  assert.equal(restored.status, 200)
  assert.ok(restored.json.users?.some(u => u.userId === scratchId), 'scratch user re-added')
})

test('a village grant to the group flows to its member users', async () => {
  assert.ok(groupId, 'precondition: create test ran')
  // scratch user has no direct grants — Pawtuxet must be invisible to it
  const before = await vgCall('getVillages', {}, { token: tokens.users.scratch })
  assert.equal(before.status, 200)
  assert.ok(!before.json.some(v => v.name === villages.scratch.name), 'no access before the group grant')

  const granted = await vgCall('createVillageGrant', { villageId: scratchVillage, ...E }, {
    ...admin, body: [{ userGroupId: groupId, roleId: 2 }],
  })
  let cleared
  try {
    assert.equal(granted.status, 201)

    const after = await vgCall('getVillages', {}, { token: tokens.users.scratch })
    assert.ok(after.json.some(v => v.name === villages.scratch.name),
      'group grant grants the member user access')
  } finally {
    // Cleanup must run even when the assertions above fail: a leftover group
    // grant on the scratch village bleeds into management.test.js, whose
    // grant-listing assertions would then match the wrong row.
    cleared = await vgCall('replaceVillageGrants', { villageId: scratchVillage, ...E }, {
      ...admin, body: [],
    })
  }
  assert.equal(cleared.status, 200)
  const revoked = await vgCall('getVillages', {}, { token: tokens.users.scratch })
  assert.ok(!revoked.json.some(v => v.name === villages.scratch.name), 'revoked with the grant')
})

test('deleteUserGroup removes the group', async () => {
  assert.ok(groupId, 'precondition: create test ran')
  const del = await vgCall('deleteUserGroup', { userGroupId: groupId, ...E }, admin)
  assert.equal(del.status, 200)
  const after = await vgCall('getUserGroup', { userGroupId: groupId, ...E }, admin)
  assert.equal(after.status, 404)
})
