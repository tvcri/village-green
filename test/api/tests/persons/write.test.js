import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, persons } from '../../setup/fixtures.js'

// Person create/patch/delete. Post-#56, person:write lives ONLY at federation
// scope (Staff, or Admin's wildcard) — every village-scoped role is read-only,
// so village users are denied even inside their granted village. The old
// cross-village RED probes (finding #5) are now green 403 assertions (fixed by
// #56). Created rows target the scratch village (id 4) and are deleted.
const scratch = String(villages.scratch.id)
const quahog = String(villages.quahog.id)

// ---- staff write lifecycle (GREEN) ----

test('createPerson as staff returns 201 and echoes fields; delete echoes the record', async () => {
  const { status, json } = await vgCall('createPerson', {}, {
    token: tokens.users.staff,
    body: { villageId: scratch, firstName: 'Glenn', lastName: 'Quagmire' },
  })
  assert.equal(status, 201)
  assert.equal(json.fullName, 'Quagmire, Glenn') // fullName is DB-generated as "last, first"
  const del = await vgCall('deletePerson', { personId: json.personId }, { token: tokens.users.staff })
  assert.equal(del.status, 200)
  assert.equal(del.json.fullName, 'Quagmire, Glenn', 'delete responds with the removed record')
})

// ---- village users: ALL person writes are denied (fixed by #56) ----

test('createPerson by a village user is denied even in their granted village', async () => {
  const res = await vgCall('createPerson', {}, {
    token: tokens.users.full_v1, // Quahog role 2 — read-only post-#56
    body: { villageId: quahog, firstName: 'Denied', lastName: 'OwnVillage' },
  })
  if (res.status === 201 && res.json?.personId) { // regression guard: undo
    await vgCall('deletePerson', { personId: res.json.personId }, { token: tokens.users.staff })
  }
  assert.equal(res.status, 403)
})

test('createPerson into an ungranted village -> 403', async () => {
  const res = await vgCall('createPerson', {}, {
    token: tokens.users.full_v1,
    body: { villageId: scratch, firstName: 'Intruder', lastName: 'Person' },
  })
  if (res.status === 201 && res.json?.personId) { // regression guard: undo
    await vgCall('deletePerson', { personId: res.json.personId }, { token: tokens.users.staff })
  }
  assert.equal(res.status, 403)
})

test('createPerson with no villageId is federation-scoped: village user -> 403, staff -> 201', async () => {
  // A villageless person is global, so creating one needs federation person:write.
  const denied = await vgCall('createPerson', {}, {
    token: tokens.users.full_v1, body: { firstName: 'Denied', lastName: 'NoVillage' },
  })
  assert.equal(denied.status, 403)
  const created = await vgCall('createPerson', {}, {
    token: tokens.users.staff, body: { firstName: 'Allowed', lastName: 'NoVillage' },
  })
  assert.equal(created.status, 201)
  await vgCall('deletePerson', { personId: created.json.personId }, { token: tokens.users.staff })
})

test('patchPerson by a village user -> 403 (own and ungranted village alike)', async () => {
  // No-op same-value patches: even a regression changes nothing.
  const own = await vgCall('patchPerson', { personId: persons.quahogMember.id }, {
    token: tokens.users.full_v1, body: { lastName: persons.quahogMember.lastName },
  })
  assert.equal(own.status, 403)
  const cross = await vgCall('patchPerson', { personId: persons.innsmouthMember.id }, {
    token: tokens.users.full_v1, body: { lastName: persons.innsmouthMember.lastName },
  })
  assert.equal(cross.status, 403)
})

test('deletePerson by a village user -> 403', async () => {
  // Probe a throwaway scratch-village person so a regression is harmless.
  const created = await vgCall('createPerson', {}, {
    token: tokens.users.staff, body: { villageId: scratch, firstName: 'Throwaway', lastName: 'DelProbe' },
  })
  assert.equal(created.status, 201)
  const id = created.json.personId
  const del = await vgCall('deletePerson', { personId: id }, { token: tokens.users.full_v1 })
  await vgCall('deletePerson', { personId: id }, { token: tokens.users.staff }) // cleanup (no-op if a regression deleted it)
  assert.equal(del.status, 403)
})
