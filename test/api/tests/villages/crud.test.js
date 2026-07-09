import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
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
//
// AUTHZ (finding #6): none of the three write paths has an authorization gate —
// the OAS asks only for the vg:village scope (no x-elevation-required, unlike
// the grant endpoints) and the controller checks no privilege or grant. The WIP
// bugs mask the hole today; the RED tests below (literal vgFetch, pinned URLs)
// keep it visible so fixing the 500 without adding a guard cannot silently open
// village writes to everyone.
const V = '/villages'
const WIP = 'Village write endpoints are WIP (createVillage 500s; patch/delete 404 for everyone)'

// ---- write authorization: MUST be denied (RED — finding #6) ----

test('createVillage by a non-admin is denied', async () => {
  // Today this 500s (the WIP ReferenceError); once that's fixed, an unguarded
  // controller would return 201 — either way this stays red until a guard lands.
  const res = await vgFetch(V, {
    token: tokens.users.full_v1, body: { name: 'Unauthorized Village (authz probe)' },
  })
  // Undo a successful insecure create (best-effort: deleteVillage is WIP too).
  const createdId = res.json?.villageId ?? res.json?.id
  if (res.status === 201 && createdId) {
    await vgFetch(`${V}/${createdId}`, {
      token: tokens.users.admin, method: 'DELETE', query: { elevate: 'true' },
    })
  }
  assert.ok(res.status === 403 || res.status === 404, `expected denial, got ${res.status}`)
})

test('patchVillage on an ungranted village is denied', async () => {
  // No-op same-value patch: even a successful insecure write changes nothing.
  // Passes today only because the grant-blind existence lookup 404s for
  // everyone — it becomes a real guard once patchVillage works.
  const { status } = await vgFetch(`${V}/${villages.quahog.id}`, {
    token: tokens.users.full_v2, method: 'PATCH', body: { name: villages.quahog.name },
  })
  assert.ok(status === 403 || status === 404, `expected denial, got ${status}`)
})

// No cross-village DELETE probe: if the WIP lookup bug were fixed without a
// guard, the probe itself would destroy a canonical village mid-run. The
// create RED above is the tripwire for the missing guard.

test('createVillage (admin) creates a village', { todo: WIP }, async () => {
  const { status, json } = await vgCall('createVillage', {}, { token: tokens.users.admin, body: { name: 'New Village' } })
  assert.equal(status, 201)
  assert.equal(json.name, 'New Village')
})

test('patchVillage renames a village the caller administers', { todo: WIP }, async () => {
  const { status, json } = await vgCall('patchVillage', { villageId: villages.quahog.id }, {
    token: tokens.users.owner_v1, body: { name: 'Quahog Renamed' },
  })
  assert.equal(status, 200)
  assert.equal(json.name, 'Quahog Renamed')
})

test('deleteVillage removes a village the caller administers', { todo: WIP }, async () => {
  const created = await vgCall('createVillage', {}, { token: tokens.users.admin, body: { name: 'Disposable Village' } })
  assert.equal(created.status, 201) // depends on createVillage (also WIP)
  const id = created.json.villageId ?? created.json.id
  const del = await vgCall('deleteVillage', { villageId: id }, { token: tokens.users.admin })
  assert.equal(del.status, 200)
})
