import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { withDb } from '../../lib/db.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'
import { auditRows } from '../audit/lib.js'

// Member drop-reason write rules (spec 5.2): a reason is required when
// dropping, cleared when leaving Dropped, a retired reason may only be kept,
// and an unknown id is 422.
const staff = tokens.users.staff
const admin = tokens.users.admin
const scratch = String(villages.scratch.id)
const uniq = (s) => `${s} ${Date.now()}-${Math.round(Math.random() * 1e6)}`

async function makeReason () {
  const name = uniq('Reason')
  const res = await vgCall('createMemberDropReason', {}, { token: admin, body: { name } })
  assert.equal(res.status, 201)
  return { id: res.json.memberDropReasonId, name }
}
const retire = (id) => vgCall('patchMemberDropReason', { memberDropReasonId: id }, { token: admin, body: { retired: true } })

async function makeMember (status = 'Active') {
  const p = await vgCall('createPerson', {}, {
    token: staff, body: { villageId: scratch, firstName: 'Throwaway', lastName: 'DropRule' },
  })
  assert.equal(p.status, 201)
  const personId = p.json.personId
  const put = await vgCall('putPersonMember', { personId }, {
    token: staff, body: { status, memberLevel: 'Household', joinDate: '2026-01-15' },
  })
  assert.equal(put.status, 200)
  return personId
}
const patch = (personId, body) => vgCall('patchPersonMember', { personId }, { token: staff, body })

test('dropping requires a reason', async () => {
  const personId = await makeMember()
  const bad = await patch(personId, { status: 'Dropped' })
  assert.equal(bad.status, 422)
  assert.match(bad.json.message ?? JSON.stringify(bad.json), /A drop reason is required\./)
  const reason = await makeReason()
  const ok = await patch(personId, { status: 'Dropped', dropReasonId: reason.id })
  assert.equal(ok.status, 200)
  assert.equal(ok.json.member.dropReasonId, reason.id)
  assert.equal(ok.json.member.dropReasonName, reason.name)
})

test('explicit null reason on a Dropped member is 422', async () => {
  const personId = await makeMember()
  const reason = await makeReason()
  await patch(personId, { status: 'Dropped', dropReasonId: reason.id })
  const bad = await patch(personId, { dropReasonId: null })
  assert.equal(bad.status, 422)
})

test('legacy dropped member saves without a reason', async () => {
  const personId = await makeMember()
  await withDb(c => c.query("UPDATE member SET status = 'Dropped', dropReasonId = NULL WHERE personId = ?", [personId]))
  const res = await patch(personId, { miscNotes: 'x' })
  assert.equal(res.status, 200)
  assert.equal(res.json.member.dropReasonId, null)
})

test('leaving Dropped clears the reason', async () => {
  const personId = await makeMember()
  const reason = await makeReason()
  const dropped = await patch(personId, { status: 'Dropped', dropReasonId: reason.id })
  assert.equal(dropped.status, 200)
  const back = await patch(personId, { status: 'Active' })
  assert.equal(back.status, 200)
  assert.equal(back.json.member.dropReasonId, null)
  assert.equal(back.json.member.dropReasonName, null)
  const rows = await auditRows('member', Number(back.json.member.memberId))
  const diff = rows[rows.length - 1].changes.diff
  assert.equal(String(diff.dropReasonId.old), reason.id, 'audit keeps the old reason id')
  assert.equal(diff.dropReasonId.new, null)
})

test('a reason sent alongside a non-Dropped status is silently cleared', async () => {
  const personId = await makeMember()
  const reason = await makeReason()
  const res = await patch(personId, { status: 'Active', dropReasonId: reason.id })
  assert.equal(res.status, 200)
  assert.equal(res.json.member.dropReasonId, null)
})

test('retired reason rejected on change', async () => {
  const personId = await makeMember()
  const reason = await makeReason()
  assert.equal((await retire(reason.id)).status, 200)
  const bad = await patch(personId, { status: 'Dropped', dropReasonId: reason.id })
  assert.equal(bad.status, 422)
  assert.match(bad.json.message ?? JSON.stringify(bad.json), /That drop reason is retired\./)
})

test('retired reason kept when unchanged', async () => {
  const personId = await makeMember()
  const reason = await makeReason()
  assert.equal((await patch(personId, { status: 'Dropped', dropReasonId: reason.id })).status, 200)
  assert.equal((await retire(reason.id)).status, 200)
  const res = await patch(personId, { dropReasonId: reason.id, miscNotes: 'y' })
  assert.equal(res.status, 200)
  assert.equal(res.json.member.dropReasonId, reason.id)
})

test('unknown reason is 422', async () => {
  const personId = await makeMember()
  const bad = await patch(personId, { status: 'Dropped', dropReasonId: '999999' })
  assert.equal(bad.status, 422)
})

test('status outside the vocabulary is 400', async () => {
  const personId = await makeMember()
  assert.equal((await patch(personId, { status: 'Cancelled' })).status, 400)
})

test('PUT creating a member as Dropped needs a reason', async () => {
  const p = await vgCall('createPerson', {}, { token: staff, body: { villageId: scratch, firstName: 'Throwaway', lastName: 'DropPut' } })
  const personId = p.json.personId
  const body = { status: 'Dropped', memberLevel: 'Household', joinDate: '2026-01-15' }
  const bad = await vgCall('putPersonMember', { personId }, { token: staff, body })
  assert.equal(bad.status, 422)
  const reason = await makeReason()
  const ok = await vgCall('putPersonMember', { personId }, { token: staff, body: { ...body, dropReasonId: reason.id } })
  assert.equal(ok.status, 200)
  assert.equal(ok.json.member.dropReasonName, reason.name)
})
