import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, persons } from '../../setup/fixtures.js'

// Village read surface. queryVillages applies the caller's grants, so by-id and
// nested routes are grant-gated — note the contrast with findings #1/#2, where
// the service-request / person by-id paths leak. (GREEN.)
// Addressed by operationId (vgCall): path + query params in one object; the
// method and URL come from the served OAS definition.

test('GET /villages with no token -> 401', async () => {
  const { status } = await vgCall('getVillages')
  assert.equal(status, 401)
})

test('GET /villages lists only the caller\'s granted villages', async () => {
  const { status, json } = await vgCall('getVillages', {}, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  const names = json.map(v => v.name)
  assert.ok(names.includes(villages.quahog.name), 'includes own Quahog')
  assert.ok(!names.includes(villages.innsmouth.name), 'must not leak Innsmouth')
  assert.ok(!names.includes(villages.miskatonic.name), 'must not leak Miskatonic')
})

test('GET /villages with admin elevate=true spans every village', async () => {
  const { status, json } = await vgCall('getVillages', { elevate: 'true' }, { token: tokens.users.admin })
  assert.equal(status, 200)
  const names = json.map(v => v.name)
  for (const want of [villages.quahog.name, villages.innsmouth.name, villages.miskatonic.name]) {
    assert.ok(names.includes(want), `elevated admin sees ${want}`)
  }
})

test('GET /villages/{id} within grant returns the village; cross-village -> 404', async () => {
  const own = await vgCall('getVillage', { villageId: villages.quahog.id }, { token: tokens.users.full_v1 })
  assert.equal(own.status, 200)
  assert.equal(own.json.name, villages.quahog.name)

  const cross = await vgCall('getVillage', { villageId: villages.innsmouth.id }, { token: tokens.users.full_v1 })
  assert.equal(cross.status, 404, 'ungranted village is not readable by id')
})

test('GET /villages/{id}/members is grant-gated', async () => {
  const own = await vgCall('getVillageMembers', { villageId: villages.quahog.id }, { token: tokens.users.full_v1 })
  assert.equal(own.status, 200)
  assert.ok(Array.isArray(own.json))

  const cross = await vgCall('getVillageMembers', { villageId: villages.innsmouth.id }, { token: tokens.users.full_v1 })
  assert.equal(cross.status, 404)
})

test('GET /villages/{id}/volunteers is grant-gated', async () => {
  const own = await vgCall('getVillageVolunteers', { villageId: villages.quahog.id }, { token: tokens.users.full_v1 })
  assert.equal(own.status, 200)
  assert.ok(Array.isArray(own.json))

  const cross = await vgCall('getVillageVolunteers', { villageId: villages.innsmouth.id }, { token: tokens.users.full_v1 })
  assert.equal(cross.status, 404)
})

test('GET /villages/{id}/persons returns the village roster; cross-village -> 404', async () => {
  const own = await vgCall('getVillagePersons', { villageId: villages.quahog.id }, { token: tokens.users.full_v1 })
  assert.equal(own.status, 200)
  const names = own.json.map(p => p.fullName)
  assert.ok(names.includes(persons.quahogMember.fullName), 'includes a Quahog person')

  const cross = await vgCall('getVillagePersons', { villageId: villages.innsmouth.id }, { token: tokens.users.full_v1 })
  assert.equal(cross.status, 404)
})
