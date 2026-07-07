import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { villages, persons } from '../../setup/fixtures.js'

// Member-role lifecycle on the person sub-resource: PUT/PATCH/DELETE
// /persons/{personId}/member — main's design, superseding the flat /members
// CRUD this suite originally specced (those todos are retired; a flat member
// list never existed and member data is read via person projections and
// /villages/{id}/members instead). The write endpoints respond with the full
// Person expanded with the memberDetail projection.
//
// Writes use throwaway Quahog persons so the canonical fixtures stay intact.
// Like the Person writes (finding #5), these handlers apply NO village-grant
// check — the cross-village probe at the bottom asserts the secure outcome
// and is RED until that's fixed.
const quahog = String(villages.quahog.id)
const memberPath = id => `/persons/${id}/member`

async function makePerson (token, lastName, body = {}) {
  const res = await vgFetch('/persons', {
    token, body: { villageId: quahog, firstName: 'Throwaway', lastName, ...body },
  })
  assert.equal(res.status, 201, 'precondition: person created')
  return res.json.personId
}

test('PUT grants the member role with an auto-assigned memberNumber', async () => {
  const id = await makePerson(tokens.users.full_v1, 'MbrPut')
  const { status, json } = await vgFetch(memberPath(id), {
    token: tokens.users.full_v1, method: 'PUT',
    body: { status: 'Active', memberLevel: 'Household' },
  })
  assert.equal(status, 200)
  assert.equal(json.personId, id, 'responds with the person')
  assert.ok(json.memberDetail, 'response carries memberDetail')
  assert.equal(json.memberDetail.personId, id)
  assert.ok(json.memberDetail.memberNumber, 'memberNumber is auto-assigned (not settable via PUT)')
  assert.equal(json.memberDetail.status, 'Active')
  assert.equal(json.memberDetail.memberLevel, 'Household')
})

test('PUT on an existing member updates the provided fields, keeping the number', async () => {
  const id = await makePerson(tokens.users.full_v1, 'MbrPut2')
  const first = await vgFetch(memberPath(id), {
    token: tokens.users.full_v1, method: 'PUT', body: { status: 'Active', memberLevel: 'Household' },
  })
  assert.equal(first.status, 200)
  const number = first.json.memberDetail.memberNumber

  const second = await vgFetch(memberPath(id), {
    token: tokens.users.full_v1, method: 'PUT', body: { status: 'Active', memberLevel: 'Individual' },
  })
  assert.equal(second.status, 200)
  assert.equal(second.json.memberDetail.memberLevel, 'Individual')
  assert.equal(second.json.memberDetail.memberNumber, number, 'memberNumber survives a re-PUT')
})

test('PATCH updates mutable member fields (including memberNumber)', async () => {
  const id = await makePerson(tokens.users.full_v1, 'MbrPatch')
  const put = await vgFetch(memberPath(id), {
    token: tokens.users.full_v1, method: 'PUT', body: { status: 'Active' },
  })
  assert.equal(put.status, 200)

  const { status, json } = await vgFetch(memberPath(id), {
    token: tokens.users.full_v1, method: 'PATCH',
    body: { serviceNotes: 'Prefers morning rides', memberNumber: 'Q-9100' },
  })
  assert.equal(status, 200)
  assert.equal(json.memberDetail.serviceNotes, 'Prefers morning rides')
  assert.equal(json.memberDetail.memberNumber, 'Q-9100')
})

test('member status drives the active_member view (non-Active hides memberInfo)', async () => {
  const id = await makePerson(tokens.users.full_v1, 'MbrDrop')
  await vgFetch(memberPath(id), {
    token: tokens.users.full_v1, method: 'PUT', body: { status: 'Active' },
  })
  const active = await vgFetch(`/persons/${id}`, {
    token: tokens.users.full_v1, query: { projection: ['memberInfo'] },
  })
  assert.ok(active.json.memberInfo, 'Active member projects memberInfo')

  const patched = await vgFetch(memberPath(id), {
    token: tokens.users.full_v1, method: 'PATCH',
    body: { status: 'Dropped', dropReason: 'Moved away' },
  })
  assert.equal(patched.status, 200)
  const dropped = await vgFetch(`/persons/${id}`, {
    token: tokens.users.full_v1, query: { projection: ['memberInfo'] },
  })
  assert.ok(!dropped.json.memberInfo, 'Dropped member is filtered out by active_member')
})

test('DELETE revokes the member role; a second DELETE 404s', async () => {
  const id = await makePerson(tokens.users.full_v1, 'MbrDel')
  await vgFetch(memberPath(id), {
    token: tokens.users.full_v1, method: 'PUT', body: { status: 'Active' },
  })
  const del = await vgFetch(memberPath(id), { token: tokens.users.full_v1, method: 'DELETE' })
  assert.equal(del.status, 204)
  const again = await vgFetch(memberPath(id), { token: tokens.users.full_v1, method: 'DELETE' })
  assert.equal(again.status, 404)
})

test('PATCH on a person with no member role -> 404', async () => {
  const id = await makePerson(tokens.users.full_v1, 'MbrNone')
  const { status } = await vgFetch(memberPath(id), {
    token: tokens.users.full_v1, method: 'PATCH', body: { serviceNotes: 'x' },
  })
  assert.equal(status, 404)
})

test('PUT for a person with no home village -> 422', async () => {
  const res = await vgFetch('/persons', {
    token: tokens.users.full_v1, body: { firstName: 'Throwaway', lastName: 'MbrNoVillage' },
  })
  assert.equal(res.status, 201, 'precondition: villageless person created')
  const { status } = await vgFetch(memberPath(res.json.personId), {
    token: tokens.users.full_v1, method: 'PUT', body: { status: 'Active' },
  })
  assert.equal(status, 422)
})

test('PUT for a nonexistent person -> 404', async () => {
  const { status } = await vgFetch(memberPath(999999), {
    token: tokens.users.full_v1, method: 'PUT', body: { status: 'Active' },
  })
  assert.equal(status, 404)
})

// ---- cross-village write: MUST be denied (RED — finding #5) ----

test('PUT member for a person outside the caller\'s grants is denied', async () => {
  // full_v2 (Innsmouth only) grants a member role to a Quahog person. A
  // successful insecure write is undone so the rest of the run is unaffected.
  const id = await makePerson(tokens.users.full_v1, 'MbrCross')
  const res = await vgFetch(memberPath(id), {
    token: tokens.users.full_v2, method: 'PUT', body: { status: 'Active' },
  })
  if (res.status === 200) {
    await vgFetch(memberPath(id), { token: tokens.users.full_v1, method: 'DELETE' })
  }
  assert.ok(res.status === 403 || res.status === 404, `expected denial, got ${res.status}`)
})
