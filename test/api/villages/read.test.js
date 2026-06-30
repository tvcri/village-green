import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../lib/client.js'
import { tokens } from '../lib/context.js'
import { villages, persons } from '../setup/fixtures.js'

// Village read surface. queryVillages applies the caller's grants, so by-id and
// nested routes are grant-gated — note the contrast with findings #1/#2, where
// the service-request / person by-id paths leak. (GREEN.)
const V = '/villages'

test('GET /villages with no token -> 401', async () => {
  const { status } = await vgFetch(V)
  assert.equal(status, 401)
})

test('GET /villages lists only the caller\'s granted villages', async () => {
  const { status, json } = await vgFetch(V, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  const names = json.map(v => v.name)
  assert.ok(names.includes(villages.quahog.name), 'includes own Quahog')
  assert.ok(!names.includes(villages.innsmouth.name), 'must not leak Innsmouth')
  assert.ok(!names.includes(villages.miskatonic.name), 'must not leak Miskatonic')
})

test('GET /villages with admin elevate=true spans every village', async () => {
  const { status, json } = await vgFetch(V, { token: tokens.users.admin, query: { elevate: 'true' } })
  assert.equal(status, 200)
  const names = json.map(v => v.name)
  for (const want of [villages.quahog.name, villages.innsmouth.name, villages.miskatonic.name]) {
    assert.ok(names.includes(want), `elevated admin sees ${want}`)
  }
})

test('GET /villages/{id} within grant returns the village; cross-village -> 404', async () => {
  const own = await vgFetch(`${V}/${villages.quahog.id}`, { token: tokens.users.full_v1 })
  assert.equal(own.status, 200)
  assert.equal(own.json.name, villages.quahog.name)

  const cross = await vgFetch(`${V}/${villages.innsmouth.id}`, { token: tokens.users.full_v1 })
  assert.equal(cross.status, 404, 'ungranted village is not readable by id')
})

test('GET /villages/{id}/members is grant-gated', async () => {
  const own = await vgFetch(`${V}/${villages.quahog.id}/members`, { token: tokens.users.full_v1 })
  assert.equal(own.status, 200)
  assert.ok(Array.isArray(own.json))

  const cross = await vgFetch(`${V}/${villages.innsmouth.id}/members`, { token: tokens.users.full_v1 })
  assert.equal(cross.status, 404)
})

test('GET /villages/{id}/volunteers is grant-gated', async () => {
  const own = await vgFetch(`${V}/${villages.quahog.id}/volunteers`, { token: tokens.users.full_v1 })
  assert.equal(own.status, 200)
  assert.ok(Array.isArray(own.json))

  const cross = await vgFetch(`${V}/${villages.innsmouth.id}/volunteers`, { token: tokens.users.full_v1 })
  assert.equal(cross.status, 404)
})

test('GET /villages/{id}/persons returns the village roster; cross-village -> 404', async () => {
  const own = await vgFetch(`${V}/${villages.quahog.id}/persons`, { token: tokens.users.full_v1 })
  assert.equal(own.status, 200)
  const names = own.json.map(p => p.fullName)
  assert.ok(names.includes(persons.quahogMember.fullName), 'includes a Quahog person')

  const cross = await vgFetch(`${V}/${villages.innsmouth.id}/persons`, { token: tokens.users.full_v1 })
  assert.equal(cross.status, 404)
})
