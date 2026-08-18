import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, users } from '../../setup/fixtures.js'
import { auditRows } from './lib.js'

// Village-scoped grant endpoints audit each affected user-grantee as an
// entityType 'user' update (mirrors tests/audit/user.test.js's
// createUserGrant/deleteUserGrant coverage). Group grantees are a
// documented v1 gap: user_group is not an audited entityType, so a grant
// keyed on userGroupId never writes an audit row. All ops run against the
// disposable `scratch` village (grants-write.test.js's convention) so the
// canonical fixtures' grants stay intact. Every op is grant:admin
// (admin + ?elevate=true).
const ADMIN_ID = 7
const G = { villageId: villages.scratch.id, elevate: 'true' }
const admin = { token: tokens.users.admin }
const scratchUserId = String(users.scratch.userId)
const secondUserId = String(users.nogrants.userId)

const createdGroupIds = []
after(async () => {
  for (const userGroupId of createdGroupIds) {
    await vgCall('deleteUserGroup', { userGroupId, elevate: 'true' }, admin)
  }
})

test('createVillageGrant / deleteVillageGrant (userId grantee) audit as grants set updates', async () => {
  const before = await auditRows('user', scratchUserId)

  const created = await vgCall('createVillageGrant', G, {
    ...admin, body: [{ userId: scratchUserId, roleId: 2 }],
  })
  assert.equal(created.status, 201)

  let rows = await auditRows('user', scratchUserId)
  assert.equal(rows.length, before.length + 1)
  let grantRow = rows[rows.length - 1]
  assert.equal(grantRow.action, 'update')
  assert.equal(grantRow.userId, ADMIN_ID)
  assert.equal(grantRow.changes.diff.grants.added.length, 1)
  assert.equal(grantRow.changes.diff.grants.added[0], `Steering Committee@${villages.scratch.name}`)

  // find the grantId to delete
  const listed = await vgCall('getVillageGrants', G, admin)
  assert.equal(listed.status, 200)
  const mine = listed.json.find(g => g.user?.userId === scratchUserId && g.roleId === 2)
  assert.ok(mine, 'created grant is listed')

  const deleted = await vgCall('deleteVillageGrant', { ...G, grantId: mine.grantId }, admin)
  assert.equal(deleted.status, 200)

  rows = await auditRows('user', scratchUserId)
  assert.equal(rows.length, before.length + 2)
  grantRow = rows[rows.length - 1]
  assert.equal(grantRow.action, 'update')
  assert.equal(grantRow.userId, ADMIN_ID)
  assert.equal(grantRow.changes.diff.grants.removed.length, 1)
  assert.equal(grantRow.changes.diff.grants.removed[0], `Steering Committee@${villages.scratch.name}`)
})

test('replaceVillageGrants swapping grantees fans out to BOTH affected users', async () => {
  // seed: scratch user holds a grant on the scratch village
  const seeded = await vgCall('createVillageGrant', G, {
    ...admin, body: [{ userId: scratchUserId, roleId: 1 }],
  })
  assert.equal(seeded.status, 201)

  const beforeScratch = await auditRows('user', scratchUserId)
  const beforeSecond = await auditRows('user', secondUserId)

  // The replace grants secondUserId (users.nogrants) a temporary Village
  // Lead grant. Wrap in try/finally so an assertion failure here still runs
  // the cleanup replace below — other suites assert nogrants sees nothing.
  try {
    // replace wholesale: scratch user's grant is gone, second user gets one
    const replaced = await vgCall('replaceVillageGrants', G, {
      ...admin, body: [{ userId: secondUserId, roleId: 3 }],
    })
    assert.equal(replaced.status, 200)

    const afterScratch = await auditRows('user', scratchUserId)
    const afterSecond = await auditRows('user', secondUserId)

    assert.equal(afterScratch.length, beforeScratch.length + 1)
    const scratchRow = afterScratch[afterScratch.length - 1]
    assert.equal(scratchRow.action, 'update')
    assert.equal(scratchRow.userId, ADMIN_ID)
    assert.equal(scratchRow.changes.diff.grants.removed.length, 1)
    assert.equal(scratchRow.changes.diff.grants.removed[0], `Local Service Coordinator@${villages.scratch.name}`)

    assert.equal(afterSecond.length, beforeSecond.length + 1)
    const secondRow = afterSecond[afterSecond.length - 1]
    assert.equal(secondRow.action, 'update')
    assert.equal(secondRow.userId, ADMIN_ID)
    assert.equal(secondRow.changes.diff.grants.added.length, 1)
    assert.equal(secondRow.changes.diff.grants.added[0], `Village Lead@${villages.scratch.name}`)
  } finally {
    // cleanup: clear the village of grants for later tests/files
    const cleared = await vgCall('replaceVillageGrants', G, { ...admin, body: [] })
    assert.equal(cleared.status, 200)
  }
})

test('a userGroupId grantee produces NO audit rows anywhere (documented v1 gap)', async () => {
  const groupCreated = await vgCall('createUserGroup', { elevate: 'true' }, {
    ...admin,
    body: { name: `audit-village-grant-group-${Date.now()}`, userIds: [scratchUserId] },
  })
  assert.equal(groupCreated.status, 201)
  const userGroupId = groupCreated.json.userGroupId
  createdGroupIds.push(userGroupId)

  const beforeScratch = await auditRows('user', scratchUserId)

  const created = await vgCall('createVillageGrant', G, {
    ...admin, body: [{ userGroupId, roleId: 2 }],
  })
  assert.equal(created.status, 201)

  let afterScratch = await auditRows('user', scratchUserId)
  assert.equal(afterScratch.length, beforeScratch.length, 'group-grantee create writes no row for its member user')

  const listed = await vgCall('getVillageGrants', G, admin)
  assert.equal(listed.status, 200)
  const mine = listed.json.find(g => g.userGroup?.userGroupId === userGroupId)
  assert.ok(mine, 'created group grant is listed')

  const deleted = await vgCall('deleteVillageGrant', { ...G, grantId: mine.grantId }, admin)
  assert.equal(deleted.status, 200)

  afterScratch = await auditRows('user', scratchUserId)
  assert.equal(afterScratch.length, beforeScratch.length, 'group-grantee delete writes no row for its member user')
})
