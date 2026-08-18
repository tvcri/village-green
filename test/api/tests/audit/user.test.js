import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'
import { auditRows } from './lib.js'

const ADMIN_ID = 7
const E = { elevate: true }

// deleteUser (both the plain HTTP path and the audit block added in this
// task) cannot be driven end-to-end here: controllers/User.js#deleteUser
// unconditionally calls KeycloakService.deleteUser, which calls Keycloak's
// admin REST API, and mockOidc implements no admin API. This is the same
// documented gap as tests/users/management.test.js's
// 'deleteUser removes a never-accessed user' todo, and
// test/api/COVERAGE-GAPS.md's "Not gaps (deliberate scope)" entry for
// "Keycloak-backed user provisioning ... deleteUser". Users created by the
// tests below are cleaned up directly via withDb instead of going through
// the delete endpoint; FK cascades clear their grants/memberships.
const createdUserIds = []
after(async () => {
  for (const userId of createdUserIds) {
    await withDb(conn => conn.query('DELETE FROM user_data WHERE userId = ?', [userId]))
  }
})

test('user create/replace(grants) audit lifecycle', async () => {
  const username = `audit-user-${Date.now()}`
  const created = await vgCall('createUser', { ...E, keycloak: 'false' }, {
    token: tokens.users.admin,
    body: { username, roleGrants: [] },
  })
  assert.equal(created.status, 201)
  const userId = created.json.userId
  createdUserIds.push(userId)

  let rows = await auditRows('user', userId)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].action, 'create')
  assert.equal(rows[0].userId, ADMIN_ID)
  assert.equal(rows[0].changes.snapshot.username, username)
  assert.deepEqual(rows[0].changes.snapshot.grants, [])

  // replaceUser with a role grant -> grants set diff under the user
  const replaced = await vgCall('replaceUser', { userId, ...E }, {
    token: tokens.users.admin,
    body: { username, roleGrants: [{ roleId: 5 /* Staff, federation-scoped */ }] },
  })
  assert.equal(replaced.status, 200)
  rows = await auditRows('user', userId)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].action, 'update')
  assert.equal(rows[1].changes.diff.grants.added.length, 1)
  assert.match(rows[1].changes.diff.grants.added[0], /@federation$/)
})

test('deleteUser hard-delete audit snapshot (incl. cascaded grants)',
  { todo: 'blocked: deleteUser calls the Keycloak admin API unconditionally (no ?keycloak=false escape) and mockOidc has no admin API, so this 500s today — same gap as tests/users/management.test.js\'s deleteUser todo and COVERAGE-GAPS.md\'s "Keycloak-backed user provisioning" exclusion. The addOrUpdateUser/deleteUser audit code is implemented per the brief and reviewed statically; it cannot be driven over HTTP in this harness.' },
  async () => {})

test('createUserGrant / deleteUserGrant audit as grants set updates', async () => {
  const username = `audit-grant-${Date.now()}`
  const created = await vgCall('createUser', { ...E, keycloak: 'false' }, {
    token: tokens.users.admin, body: { username, roleGrants: [] },
  })
  assert.equal(created.status, 201)
  const userId = created.json.userId
  createdUserIds.push(userId)

  // grant:admin requires elevate:true (mirrors tests/users/management.test.js)
  const granted = await vgCall('createUserGrant', { userId, ...E }, {
    token: tokens.users.admin, body: [{ roleId: 5, villageId: null }],
  })
  assert.equal(granted.status, 201)
  let rows = await auditRows('user', userId)
  let grantRow = rows[rows.length - 1]
  assert.equal(grantRow.action, 'update')
  assert.equal(grantRow.changes.diff.grants.added.length, 1)
  assert.match(grantRow.changes.diff.grants.added[0], /@federation$/)

  // find the grantId to delete — same read-back as management.test.js's
  // "user grants: create -> list -> delete" test.
  const listed = await vgCall('getUserGrants', { userId, ...E }, { token: tokens.users.admin })
  assert.equal(listed.status, 200)
  const mine = listed.json.find(g => g.roleId === 5)
  assert.ok(mine, 'created grant is listed')

  const deleted = await vgCall('deleteUserGrant', { userId, grantId: mine.grantId, ...E }, {
    token: tokens.users.admin,
  })
  assert.equal(deleted.status, 200)
  rows = await auditRows('user', userId)
  grantRow = rows[rows.length - 1]
  assert.equal(grantRow.action, 'update')
  assert.equal(grantRow.changes.diff.grants.removed.length, 1)
})
