import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { users } from '../../setup/fixtures.js'
import { auditRows } from './lib.js'

// Group-side membership operations mutate the audited `user` aggregate's
// userGroups set (the map rewrite directly; group deletion via FK cascade),
// so they fan out per-member audit rows — closing the last silent-mutation
// path into an audited aggregate (2026-08-19 peer-review finding).
const ADMIN_ID = 7
const admin = { token: tokens.users.admin }
const E = { elevate: 'true' }
const scratchUserId = String(users.scratch.userId)

test('group create/rename/membership/delete fan out audit rows to affected users', async () => {
  const name = `audit-ug-${Date.now()}`
  const renamed = `${name}-renamed`

  // create with scratch as a member -> one update row: userGroups added
  let mark = (await auditRows('user', scratchUserId)).length
  const created = await vgCall('createUserGroup', E, {
    ...admin, body: { name, userIds: [scratchUserId] },
  })
  assert.equal(created.status, 201)
  const userGroupId = created.json.userGroupId
  let rows = await auditRows('user', scratchUserId)
  assert.equal(rows.length, mark + 1, 'group create audits the member')
  let last = rows[rows.length - 1]
  assert.equal(last.action, 'update')
  assert.equal(last.userId, ADMIN_ID)
  assert.deepEqual(last.changes.diff.userGroups, { added: [name] })

  // rename -> the member's userGroups labels change: removed old, added new
  mark = rows.length
  const patched = await vgCall('patchUserGroup', { userGroupId, ...E }, {
    ...admin, body: { name: renamed },
  })
  assert.equal(patched.status, 200)
  rows = await auditRows('user', scratchUserId)
  assert.equal(rows.length, mark + 1, 'group rename audits the member (label change)')
  last = rows[rows.length - 1]
  assert.deepEqual(last.changes.diff.userGroups, { added: [renamed], removed: [name] })

  // no-op patch (same name, same membership) -> no new rows
  mark = rows.length
  const noop = await vgCall('patchUserGroup', { userGroupId, ...E }, {
    ...admin, body: { name: renamed, userIds: [scratchUserId] },
  })
  assert.equal(noop.status, 200)
  rows = await auditRows('user', scratchUserId)
  assert.equal(rows.length, mark, 'no-op group patch writes no audit rows')

  // remove the member via empty userIds -> userGroups removed
  mark = rows.length
  const emptied = await vgCall('patchUserGroup', { userGroupId, ...E }, {
    ...admin, body: { userIds: [] },
  })
  assert.equal(emptied.status, 200)
  rows = await auditRows('user', scratchUserId)
  assert.equal(rows.length, mark + 1, 'membership removal audits the member')
  last = rows[rows.length - 1]
  assert.deepEqual(last.changes.diff.userGroups, { removed: [renamed] })

  // re-add, then delete the group -> cascade-driven removal is audited
  await vgCall('patchUserGroup', { userGroupId, ...E }, { ...admin, body: { userIds: [scratchUserId] } })
  mark = (await auditRows('user', scratchUserId)).length
  const del = await vgCall('deleteUserGroup', { userGroupId, ...E }, admin)
  assert.equal(del.status, 200)
  rows = await auditRows('user', scratchUserId)
  assert.equal(rows.length, mark + 1, 'group deletion audits every member the cascade strips')
  last = rows[rows.length - 1]
  assert.equal(last.userId, ADMIN_ID)
  assert.deepEqual(last.changes.diff.userGroups, { removed: [renamed] })
})
