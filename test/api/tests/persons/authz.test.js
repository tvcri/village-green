import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, persons } from '../../setup/fixtures.js'

// Post-#56 RBAC contract for person reads:
//  - getPersons: a village-scoped caller MUST filter with villageId ⊆ granted;
//    no filter = federation-wide query -> 403. Any ungranted id in the filter
//    -> 403 (denied outright, not silently narrowed). Federation readers list
//    everything unfiltered.
//  - getPerson: the record is fetched first, then person:read is checked
//    against its village — ungranted -> 403 (was 404 pre-#56).
//  - nested /villages/{id}/persons: per-village perm is checked BEFORE existence.

const quahog = String(villages.quahog.id)

// ---- list endpoint (GREEN) ----

test('full_v1 person list filtered to Quahog shows only Quahog people', async () => {
  const { status, json } = await vgCall('getPersons', { villageId: [quahog] }, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  const names = json.map(p => p.fullName)
  assert.ok(names.includes(persons.quahogMember.fullName), 'should include a Quahog person')
  assert.ok(!names.includes(persons.innsmouthMember.fullName), 'must not leak an Innsmouth person')
  assert.ok(!names.includes(persons.miskatonicMember.fullName), 'must not leak a Miskatonic person')
})

test('village user without a villageId filter -> 403 (no filter = federation-wide query)', async () => {
  const { status } = await vgCall('getPersons', {}, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('villageId filter containing an ungranted village -> 403, not a narrowed 200', async () => {
  const { status } = await vgCall('getPersons',
    { villageId: [quahog, String(villages.innsmouth.id)] },
    { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('nogrants -> 403 on the person list, filtered or not', async () => {
  const unfiltered = await vgCall('getPersons', {}, { token: tokens.users.nogrants })
  assert.equal(unfiltered.status, 403)
  const filtered = await vgCall('getPersons', { villageId: [quahog] }, { token: tokens.users.nogrants })
  assert.equal(filtered.status, 403)
})

test('federation reader (board) lists every village unfiltered', async () => {
  const { status, json } = await vgCall('getPersons', {}, { token: tokens.users.board })
  assert.equal(status, 200)
  const names = json.map(p => p.fullName)
  for (const p of [persons.quahogMember, persons.innsmouthMember, persons.miskatonicMember]) {
    assert.ok(names.includes(p.fullName), `board list includes ${p.fullName}`)
  }
})

// ---- by-id within own grant: works (GREEN sanity) ----

test('full_v1 can read its own village person by id', async () => {
  const { status } = await vgCall('getPerson', { personId: persons.quahogMember.id }, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
})

// ---- by-id across villages: denied (fixed by #56 — was RED finding #1) ----

test('full_v1 cannot read an Innsmouth person by id -> 403', async () => {
  // The record is fetched, then person:read is checked against ITS village:
  // ungranted -> 403 (existence is disclosed; content is not).
  const { status, json } = await vgCall('getPerson', { personId: persons.innsmouthMember.id }, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
  if (json && json.address) {
    assert.fail(`leaked Innsmouth person contact info: ${JSON.stringify({ address: json.address, phone: json.phone, email: json.email })}`)
  }
})

test('getPerson for a nonexistent id -> 404 (distinct from the 403 denial)', async () => {
  const { status } = await vgCall('getPerson', { personId: 999999 }, { token: tokens.users.staff })
  assert.equal(status, 404)
})

// ---- nested route: perm checked before existence (GREEN) ----

test('full_v1 gets 403 for an ungranted village persons route', async () => {
  const { status } = await vgCall('getVillagePersons', { villageId: villages.innsmouth.id }, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})
