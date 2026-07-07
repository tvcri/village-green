import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { villages, persons, members as mem } from '../../setup/fixtures.js'

// SPEC — STALE: written against a flat /members CRUD API that was never built.
// main implemented the member role as a person sub-resource instead
// (PUT/PATCH/DELETE /persons/{personId}/member), so these todos must be
// RETARGETED at those endpoints before they can flip green. Auth/scope gating
// for the real endpoints is verified GREEN in authz.test.js.
const STUB = 'specced against the superseded flat /members API; retarget to /persons/{id}/member'
const MEMBERS = '/members'
const quahog = String(villages.quahog.id)

// Create a throwaway Quahog person + member so the create/update/delete specs
// operate on disposable rows (the canonical fixtures stay intact). Only does real
// work once the Member endpoints exist; before then it fails fast at the member
// POST (the person POST it makes is wiped by the next run's reseed).
async function makeMember (token, { memberNumber } = {}) {
  // Unique fullName per call — person has a unique (village_id, full_name) index,
  // so a fixed name would collide on the 2nd makeMember in a run.
  const person = await vgFetch('/persons', { token, body: { villageId: quahog, firstName: 'Throwaway', lastName: `M${memberNumber}` } })
  assert.equal(person.status, 201, 'precondition: person created')
  const created = await vgFetch(MEMBERS, { token, body: { personId: person.json.personId, memberNumber } })
  assert.equal(created.status, 201, 'member created')
  return created.json
}

// ---- list / read ----

test('GET /members returns the caller\'s granted-village members as an array', { todo: STUB }, async () => {
  const { status, json } = await vgFetch(MEMBERS, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json), 'body must be an array of members')
  const numbers = json.map(m => m.memberNumber)
  assert.ok(numbers.includes('Q-1001'), 'includes the caller\'s own Quahog member')
  assert.ok(!numbers.includes('I-2001'), 'must not leak the Innsmouth member')
  assert.ok(!numbers.includes('M-3001'), 'must not leak the Miskatonic member')
})

test('GET /members is grant-scoped per caller (full_v2 sees Innsmouth, not Quahog)', { todo: STUB }, async () => {
  const { status, json } = await vgFetch(MEMBERS, { token: tokens.users.full_v2 })
  assert.equal(status, 200)
  const numbers = json.map(m => m.memberNumber)
  assert.ok(numbers.includes('I-2001'), 'includes the caller\'s own Innsmouth member')
  assert.ok(!numbers.includes('Q-1001'), 'must not leak the Quahog member')
})

test('GET /members/{id} within the caller\'s grant returns the member', { todo: STUB }, async () => {
  const { status, json } = await vgFetch(`${MEMBERS}/${mem.quahog.id}`, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.equal(json.memberId, String(mem.quahog.id))
  assert.equal(json.personId, String(persons.quahogMember.id))
  assert.equal(json.memberNumber, 'Q-1001')
})

test('GET /members/{id} for a member outside the caller\'s grants -> 404', { todo: STUB }, async () => {
  const { status } = await vgFetch(`${MEMBERS}/${mem.innsmouth.id}`, { token: tokens.users.full_v1 })
  assert.equal(status, 404)
})

// ---- create / update / delete ----

test('POST /members creates a member and echoes the fields', { todo: STUB }, async () => {
  const person = await vgFetch('/persons', {
    token: tokens.users.full_v1,
    body: { villageId: quahog, firstName: 'Brand New', lastName: 'Member' },
  })
  assert.equal(person.status, 201)
  const { status, json } = await vgFetch(MEMBERS, {
    token: tokens.users.full_v1,
    body: { personId: person.json.personId, memberNumber: 'Q-9001' },
  })
  assert.equal(status, 201)
  assert.ok(json.memberId, 'returns a new memberId')
  assert.equal(json.personId, person.json.personId)
  assert.equal(json.memberNumber, 'Q-9001')
})

test('PATCH /members/{id} updates mutable fields', { todo: STUB }, async () => {
  const member = await makeMember(tokens.users.full_v1, { memberNumber: 'Q-9002' })
  const { status, json } = await vgFetch(`${MEMBERS}/${member.memberId}`, {
    token: tokens.users.full_v1,
    method: 'PATCH',
    body: { serviceNotes: 'Prefers morning rides' },
  })
  assert.equal(status, 200)
  assert.equal(json.serviceNotes, 'Prefers morning rides')
})

test('DELETE /members/{id} removes the member', { todo: STUB }, async () => {
  const member = await makeMember(tokens.users.full_v1, { memberNumber: 'Q-9003' })
  const del = await vgFetch(`${MEMBERS}/${member.memberId}`, { token: tokens.users.full_v1, method: 'DELETE' })
  assert.equal(del.status, 200)
  const after = await vgFetch(`${MEMBERS}/${member.memberId}`, { token: tokens.users.full_v1 })
  assert.equal(after.status, 404, 'deleted member is gone')
})

// ---- cross-village write authz ----

test('POST /members for a person outside the caller\'s grants is denied', { todo: STUB }, async () => {
  // full_v1 (Quahog) attempts to enroll an Innsmouth person as a member.
  const { status } = await vgFetch(MEMBERS, {
    token: tokens.users.full_v1,
    body: { personId: String(persons.innsmouthMember.id), memberNumber: 'X-0001' },
  })
  assert.ok(status === 403 || status === 404, `expected denial, got ${status}`)
})
