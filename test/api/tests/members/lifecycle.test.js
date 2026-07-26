import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// Member-role lifecycle on the person sub-resource: PUT/PATCH/DELETE
// /persons/{personId}/member. The write endpoints respond with the full Person
// expanded with the `member` projection (post-#56 property name; memberDetail
// is gone).
//
// Post-#56, member:write lives only at federation scope, so the lifecycle runs
// as staff; the village-user denial is pinned explicitly at the bottom (fixed
// by #56 — was RED finding #5). Throwaway persons live in the scratch village
// (id 4), the one village tests may mutate freely.
const scratch = String(villages.scratch.id)
const staff = tokens.users.staff

async function makePerson (lastName, body = {}) {
  const res = await vgCall('createPerson', {}, {
    token: staff, body: { villageId: scratch, firstName: 'Throwaway', lastName, ...body },
  })
  assert.equal(res.status, 201, 'precondition: person created')
  return res.json.personId
}

test('PUT grants the member role with an auto-assigned memberNumber', async () => {
  const personId = await makePerson('MbrPut')
  const { status, json } = await vgCall('putPersonMember', { personId }, {
    token: staff,
    body: { status: 'Active', memberLevel: 'Household' },
  })
  assert.equal(status, 200)
  assert.equal(json.personId, personId, 'responds with the person')
  assert.ok(json.member, 'response carries the member projection')
  assert.equal(json.member.personId, personId)
  assert.ok(json.member.memberNumber, 'memberNumber is auto-assigned (not settable via PUT)')
  assert.equal(json.member.status, 'Active')
  assert.equal(json.member.memberLevel, 'Household')
})

test('PUT on an existing member updates the provided fields, keeping the number', async () => {
  const personId = await makePerson('MbrPut2')
  const first = await vgCall('putPersonMember', { personId }, {
    token: staff, body: { status: 'Active', memberLevel: 'Household' },
  })
  assert.equal(first.status, 200)
  const number = first.json.member.memberNumber

  const second = await vgCall('putPersonMember', { personId }, {
    token: staff, body: { status: 'Active', memberLevel: 'Individual' },
  })
  assert.equal(second.status, 200)
  assert.equal(second.json.member.memberLevel, 'Individual')
  assert.equal(second.json.member.memberNumber, number, 'memberNumber survives a re-PUT')
})

test('PATCH updates mutable member fields (including memberNumber)', async () => {
  const personId = await makePerson('MbrPatch')
  const put = await vgCall('putPersonMember', { personId }, {
    token: staff, body: { status: 'Active' },
  })
  assert.equal(put.status, 200)

  const { status, json } = await vgCall('patchPersonMember', { personId }, {
    token: staff,
    body: { serviceNotes: 'Prefers morning rides', memberNumber: 'Q-9100' },
  })
  assert.equal(status, 200)
  assert.equal(json.member.serviceNotes, 'Prefers morning rides')
  assert.equal(json.member.memberNumber, 'Q-9100')
})

test('member row visibility tracks status + caller\'s member:read_inactive', async () => {
  // Without member:read_inactive the projection reads the active_member view,
  // so a Dropped member yields null; with it (staff) the row stays visible.
  // board is the federation reader WITHOUT read_inactive.
  const personId = await makePerson('MbrDrop')
  await vgCall('putPersonMember', { personId }, { token: staff, body: { status: 'Active' } })
  const active = await vgCall('getPerson', { personId, projection: ['member'] }, {
    token: tokens.users.board,
  })
  assert.ok(active.json.member, 'Active member projects for a plain reader')

  const patched = await vgCall('patchPersonMember', { personId }, {
    token: staff, body: { status: 'Dropped', dropReason: 'Moved away' },
  })
  assert.equal(patched.status, 200)
  const droppedPlain = await vgCall('getPerson', { personId, projection: ['member'] }, {
    token: tokens.users.board,
  })
  assert.ok(!droppedPlain.json.member, 'Dropped member is filtered out by active_member')
  const droppedStaff = await vgCall('getPerson', { personId, projection: ['member'] }, {
    token: staff,
  })
  assert.ok(droppedStaff.json.member, 'member:read_inactive still sees the Dropped row')
})

test('DELETE revokes the member role; a second DELETE 404s', async () => {
  const personId = await makePerson('MbrDel')
  await vgCall('putPersonMember', { personId }, { token: staff, body: { status: 'Active' } })
  const del = await vgCall('deletePersonMember', { personId }, { token: staff })
  assert.equal(del.status, 204)
  const again = await vgCall('deletePersonMember', { personId }, { token: staff })
  assert.equal(again.status, 404)
})

test('PATCH on a person with no member role -> 404', async () => {
  const personId = await makePerson('MbrNone')
  const { status } = await vgCall('patchPersonMember', { personId }, {
    token: staff, body: { serviceNotes: 'x' },
  })
  assert.equal(status, 404)
})

test('PUT for a person with no home village -> 422', async () => {
  // A villageless person is federation-scoped, so only staff/admin can create
  // one; the member role still requires a home village -> 422.
  const res = await vgCall('createPerson', {}, {
    token: staff, body: { firstName: 'Throwaway', lastName: 'MbrNoVillage' },
  })
  assert.equal(res.status, 201, 'precondition: villageless person created')
  const { status } = await vgCall('putPersonMember', { personId: res.json.personId }, {
    token: staff, body: { status: 'Active' },
  })
  assert.equal(status, 422)
  await vgCall('deletePerson', { personId: res.json.personId }, { token: staff })
})

test('PUT for a nonexistent person -> 404', async () => {
  const { status } = await vgCall('putPersonMember', { personId: 999999 }, {
    token: staff, body: { status: 'Active' },
  })
  assert.equal(status, 404)
})

// ---- village users cannot write member roles (fixed by #56 — was RED finding #5) ----

test('PUT member by a village user -> 403 (member:write is federation-only)', async () => {
  const id = await makePerson('MbrCross')
  for (const token of [tokens.users.full_v1, tokens.users.full_v2]) {
    const res = await vgCall('putPersonMember', { personId: id }, {
      token, body: { status: 'Active' },
    })
    if (res.status === 200) { // regression guard: undo
      await vgCall('deletePersonMember', { personId: id }, { token: staff })
    }
    assert.equal(res.status, 403)
  }
})
