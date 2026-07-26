import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { users } from '../../setup/fixtures.js'

// Post-#56, elevation is confined to the four federation-only admin perms
// (village:create, user:admin, grant:admin, app:admin — held only via Admin's
// wildcard) and `elevate` is no longer declared on resource reads. The gate is
// hasPermission(perm) && elevate=true, plus setupUser's up-front "you can't
// even ask" rejection of elevate=true from anyone holding no elevatable perm.
// getUsers (user:admin) is the representative elevation-gated endpoint here.

test('admin with elevate=true -> 200 (getUsers lists every user)', async () => {
  const { status, json } = await vgCall('getUsers', { elevate: 'true' }, { token: tokens.users.admin })
  assert.equal(status, 200)
  const usernames = json.map(u => u.username)
  for (const u of [users.admin, users.full_v1, users.staff]) {
    assert.ok(usernames.includes(u.username), `elevated admin should list ${u.username}`)
  }
})

test('admin without elevate -> 403 (elevation is mandatory even for admin)', async () => {
  const { status, json } = await vgCall('getUsers', {}, { token: tokens.users.admin })
  assert.equal(status, 403)
  assert.equal(json.error, 'User has insufficient privilege to complete this request.')
})

test('non-admin with elevate=true -> 403 rejected up-front', async () => {
  // setupUser rejects elevate=true before routing when the caller holds no
  // elevatable perm — village users and non-admin federation users alike.
  for (const who of ['full_v1', 'staff']) {
    const { status, json } = await vgCall('getUsers', { elevate: 'true' }, { token: tokens.users[who] })
    assert.equal(status, 403, who)
    assert.equal(json.error, 'Invalid use of parameter elevate=true.', who)
  }
})

test('GET /user reports canElevate true only for admin', async () => {
  for (const [who, expected] of [['admin', true], ['full_v1', false], ['staff', false]]) {
    const { status, json } = await vgCall('getUser', {}, { token: tokens.users[who] })
    assert.equal(status, 200, who)
    assert.equal(json.canElevate, expected, `${who} canElevate`)
  }
})
