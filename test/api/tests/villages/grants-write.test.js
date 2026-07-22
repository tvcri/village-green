import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, users } from '../../setup/fixtures.js'

// Admin grant-management write happy-paths, run against the disposable `scratch`
// village so the canonical fixtures' grants stay intact. All require admin +
// ?elevate=true (grant:admin). A grant body pairs its roleId with the PATH's
// villageId, so only village-scope roles (1 LSC, 2 Steering Committee,
// 3 Village Lead) are valid here — validateRoleGrants 422s a federation role
// (4-7) under a village. getVillageGrants returns
// [{ grantId, roleId, user:{userId,...} }] (or userGroup for group grants).
const G = { villageId: villages.scratch.id, elevate: 'true' }
const scratchUser = String(users.scratch.userId)
const admin = { token: tokens.users.admin }
const mineFor = (rows) => rows.filter(g => g.user?.userId === scratchUser)

test('village grant lifecycle (scratch): create -> list -> replace -> delete', async () => {
  // create one grant
  const created = await vgCall('createVillageGrant', G, { ...admin, body: [{ userId: scratchUser, roleId: 2 }] })
  assert.equal(created.status, 201)

  let rows = (await vgCall('getVillageGrants', G, admin)).json
  let mine = mineFor(rows)
  assert.equal(mine.length, 1, 'one grant for the scratch user')
  assert.equal(mine[0].roleId, 2)

  // replace the whole set (role 2 -> 3; stays village-scope)
  const replaced = await vgCall('replaceVillageGrants', G, { ...admin, body: [{ userId: scratchUser, roleId: 3 }] })
  assert.equal(replaced.status, 200)
  rows = (await vgCall('getVillageGrants', G, admin)).json
  mine = mineFor(rows)
  assert.equal(mine.length, 1, 'still exactly one grant after replace')
  assert.equal(mine[0].roleId, 3, 'role replaced to Village Lead')

  // delete it
  const del = await vgCall('deleteVillageGrant', { ...G, grantId: mine[0].grantId }, admin)
  assert.equal(del.status, 200)
  rows = (await vgCall('getVillageGrants', G, admin)).json
  assert.equal(mineFor(rows).length, 0, 'grant removed')
})

test('replaceVillageGrants with an empty set clears the village', async () => {
  await vgCall('createVillageGrant', G, { ...admin, body: [{ userId: scratchUser, roleId: 1 }] })
  const cleared = await vgCall('replaceVillageGrants', G, { ...admin, method: 'PUT', body: [] })
  assert.equal(cleared.status, 200)
  const rows = (await vgCall('getVillageGrants', G, admin)).json
  assert.equal(mineFor(rows).length, 0, 'scratch user grant cleared')
})

test('a federation-scope roleId under a village -> 422 (nothing created)', async () => {
  // validateRoleGrants: a federation role (here 5 = Staff) must carry no
  // villageId, but grants written under /villages/{id}/grants always do.
  const { status } = await vgCall('createVillageGrant', G, {
    ...admin, body: [{ userId: scratchUser, roleId: 5 }],
  })
  assert.equal(status, 422)
  const rows = (await vgCall('getVillageGrants', G, admin)).json
  assert.equal(mineFor(rows).length, 0, 'rejected grant left no row behind')
})
