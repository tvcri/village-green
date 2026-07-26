import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, persons } from '../../setup/fixtures.js'

// Village read surface, post-#56 RBAC. GET /villages is ungated: every authed
// caller gets 200 with the slice its grants allow — federation readers see all
// villages, a village grant yields that subset, no grants yields []. By-id and
// nested routes check the per-village read permission BEFORE existence, so an
// ungranted village -> 403 (even a nonexistent one); only a caller who clears
// the gate can learn 404. (GREEN.)
// Addressed by operationId (vgCall): path + query params in one object; the
// method and URL come from the served OAS definition.

const CANONICAL = [villages.quahog.name, villages.innsmouth.name, villages.miskatonic.name]
const NONEXISTENT = 999999

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

test('GET /villages: federation readers span every village on a plain call', async () => {
  // elevate is gone from this op — admin's federation wildcard makes it
  // omniscient without any query param (the pre-#56 "admin without elevate
  // sees only granted = none" behavior no longer exists). Staff, board and
  // service coordinator hold federation-scope village:read and see the same.
  for (const who of ['admin', 'staff', 'board', 'sc']) {
    const { status, json } = await vgCall('getVillages', {}, { token: tokens.users[who] })
    assert.equal(status, 200, `${who} status`)
    const names = json.map(v => v.name)
    for (const want of CANONICAL) {
      assert.ok(names.includes(want), `${who} sees ${want}`)
    }
  }
})

test('GET /villages with zero grants -> 403 (deny-by-default staff gate)', async () => {
  // utils/accessGates.js: grantless users are denied outside the exempt
  // prefixes (/user, /op, /privacy, ...) before any controller runs.
  const { status } = await vgCall('getVillages', {}, { token: tokens.users.nogrants })
  assert.equal(status, 403)
})

test('GET /villages/{id} within grant returns the village; ungranted -> 403', async () => {
  const own = await vgCall('getVillage', { villageId: villages.quahog.id }, { token: tokens.users.full_v1 })
  assert.equal(own.status, 200)
  assert.equal(own.json.name, villages.quahog.name)

  // Was 404 pre-#56; the permission is now checked before the lookup.
  const cross = await vgCall('getVillage', { villageId: villages.innsmouth.id }, { token: tokens.users.full_v1 })
  assert.equal(cross.status, 403, 'ungranted village is denied, not hidden')
})

test('GET /villages/{id}: gate before existence — 403 ungranted, 404 only past the gate', async () => {
  // A village user holds no grant on a nonexistent id, so the perm check fires
  // first and it cannot distinguish missing from forbidden.
  const gated = await vgCall('getVillage', { villageId: NONEXISTENT }, { token: tokens.users.full_v1 })
  assert.equal(gated.status, 403)

  // A federation reader clears the gate everywhere, so it reaches the lookup.
  const missing = await vgCall('getVillage', { villageId: NONEXISTENT }, { token: tokens.users.staff })
  assert.equal(missing.status, 404)
})

test('GET /villages/{id}/members is grant-gated (403 cross-village)', async () => {
  const own = await vgCall('getVillageMembers', { villageId: villages.quahog.id }, { token: tokens.users.full_v1 })
  assert.equal(own.status, 200)
  assert.ok(Array.isArray(own.json))

  const cross = await vgCall('getVillageMembers', { villageId: villages.innsmouth.id }, { token: tokens.users.full_v1 })
  assert.equal(cross.status, 403)

  // Same ordering as getVillage: only a caller with member:read there gets 404.
  const missing = await vgCall('getVillageMembers', { villageId: NONEXISTENT }, { token: tokens.users.staff })
  assert.equal(missing.status, 404)
})

test('GET /villages/{id}/volunteers is grant-gated (403 cross-village)', async () => {
  const own = await vgCall('getVillageVolunteers', { villageId: villages.quahog.id }, { token: tokens.users.full_v1 })
  assert.equal(own.status, 200)
  assert.ok(Array.isArray(own.json))

  const cross = await vgCall('getVillageVolunteers', { villageId: villages.innsmouth.id }, { token: tokens.users.full_v1 })
  assert.equal(cross.status, 403)
})

test('GET /villages/{id}/persons returns the village roster; cross-village -> 403', async () => {
  const own = await vgCall('getVillagePersons', { villageId: villages.quahog.id }, { token: tokens.users.full_v1 })
  assert.equal(own.status, 200)
  const names = own.json.map(p => p.fullName)
  assert.ok(names.includes(persons.quahogMember.fullName), 'includes a Quahog person')

  const cross = await vgCall('getVillagePersons', { villageId: villages.innsmouth.id }, { token: tokens.users.full_v1 })
  assert.equal(cross.status, 403)
})
