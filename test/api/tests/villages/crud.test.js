import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// Village create / patch / delete are WIP and currently broken, so the desired
// behavior is specced as todos (they flip green once the endpoints are fixed):
//   - createVillage 500s: VillageService.createVillage calls a bare `queryVillages`
//     (ReferenceError — the export is module.exports.queryVillages). [VillageService.js:204]
//   - patchVillage / deleteVillage check existence via getVillage(villageId) with
//     no grants passed, so the lookup returns nothing and they 404 even for an
//     owner of the village.
// When promoting these, route patch/delete at a throwaway village for isolation.
const V = '/villages'
const WIP = 'Village write endpoints are WIP (createVillage 500s; patch/delete 404 for everyone)'

test('createVillage (admin) creates a village', { todo: WIP }, async () => {
  const { status, json } = await vgFetch(V, { token: tokens.users.admin, body: { name: 'New Village' } })
  assert.equal(status, 201)
  assert.equal(json.name, 'New Village')
})

test('patchVillage renames a village the caller administers', { todo: WIP }, async () => {
  const { status, json } = await vgFetch(`${V}/${villages.quahog.id}`, {
    token: tokens.users.owner_v1, method: 'PATCH', body: { name: 'Quahog Renamed' },
  })
  assert.equal(status, 200)
  assert.equal(json.name, 'Quahog Renamed')
})

test('deleteVillage removes a village the caller administers', { todo: WIP }, async () => {
  const created = await vgFetch(V, { token: tokens.users.admin, body: { name: 'Disposable Village' } })
  assert.equal(created.status, 201) // depends on createVillage (also WIP)
  const id = created.json.villageId ?? created.json.id
  const del = await vgFetch(`${V}/${id}`, { token: tokens.users.admin, method: 'DELETE' })
  assert.equal(del.status, 200)
})
