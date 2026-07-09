import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, users } from '../../setup/fixtures.js'

// Admin grant-management write happy-paths, run against the disposable `scratch`
// village so the canonical fixtures' grants stay intact. All require admin +
// ?elevate=true. getVillageGrants returns [{ grantId, roleId, user:{userId,...} }].
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

  // replace the whole set (role 2 -> 4)
  const replaced = await vgCall('replaceVillageGrants', G, { ...admin, body: [{ userId: scratchUser, roleId: 4 }] })
  assert.equal(replaced.status, 200)
  rows = (await vgCall('getVillageGrants', G, admin)).json
  mine = mineFor(rows)
  assert.equal(mine.length, 1, 'still exactly one grant after replace')
  assert.equal(mine[0].roleId, 4, 'role replaced to owner')

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
