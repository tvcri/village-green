import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { villages, users } from '../../setup/fixtures.js'

// Admin grant-management write happy-paths, run against the disposable `scratch`
// village so the canonical fixtures' grants stay intact. All require admin +
// ?elevate=true. getVillageGrants returns [{ grantId, roleId, user:{userId,...} }].
const grantsUrl = `/villages/${villages.scratch.id}/grants`
const scratchUser = String(users.scratch.userId)
const A = { token: tokens.users.admin, query: { elevate: 'true' } }
const mineFor = (rows) => rows.filter(g => g.user?.userId === scratchUser)

test('village grant lifecycle (scratch): create -> list -> replace -> delete', async () => {
  // create one grant
  const created = await vgFetch(grantsUrl, { ...A, body: [{ userId: scratchUser, roleId: 2 }] })
  assert.equal(created.status, 201)

  let rows = (await vgFetch(grantsUrl, A)).json
  let mine = mineFor(rows)
  assert.equal(mine.length, 1, 'one grant for the scratch user')
  assert.equal(mine[0].roleId, 2)

  // replace the whole set (role 2 -> 4)
  const replaced = await vgFetch(grantsUrl, { ...A, method: 'PUT', body: [{ userId: scratchUser, roleId: 4 }] })
  assert.equal(replaced.status, 200)
  rows = (await vgFetch(grantsUrl, A)).json
  mine = mineFor(rows)
  assert.equal(mine.length, 1, 'still exactly one grant after replace')
  assert.equal(mine[0].roleId, 4, 'role replaced to owner')

  // delete it
  const del = await vgFetch(`${grantsUrl}/${mine[0].grantId}`, { ...A, method: 'DELETE' })
  assert.equal(del.status, 200)
  rows = (await vgFetch(grantsUrl, A)).json
  assert.equal(mineFor(rows).length, 0, 'grant removed')
})

test('replaceVillageGrants with an empty set clears the village', async () => {
  await vgFetch(grantsUrl, { ...A, body: [{ userId: scratchUser, roleId: 1 }] })
  const cleared = await vgFetch(grantsUrl, { ...A, method: 'PUT', body: [] })
  assert.equal(cleared.status, 200)
  const rows = (await vgFetch(grantsUrl, A)).json
  assert.equal(mineFor(rows).length, 0, 'scratch user grant cleared')
})
