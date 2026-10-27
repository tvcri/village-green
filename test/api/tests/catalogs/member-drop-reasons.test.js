import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { withDb } from '../../lib/db.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'
import { auditRows } from '../audit/lib.js'

// /member-drop-reasons: admin-managed catalog. Any staff user reads; only
// drop_reason:admin writes (Admin's '*'). Names are unique; a reason a member
// carries can't be deleted (409 with the count).
const staff = tokens.users.staff
const admin = tokens.users.admin
const uniq = (s) => `${s} ${Date.now()}-${Math.round(Math.random() * 1e6)}`

test('admin creates, renames, retires and deletes a reason', async () => {
  const name = uniq('Moved away')
  const created = await vgCall('createMemberDropReason', {}, { token: admin, body: { name, description: 'Left the area' } })
  assert.equal(created.status, 201)
  assert.equal(created.json.name, name)
  assert.equal(created.json.description, 'Left the area')
  assert.equal(created.json.retired, false)
  assert.equal(created.json.holderCount, 0)
  const memberDropReasonId = created.json.memberDropReasonId

  const retired = await vgCall('patchMemberDropReason', { memberDropReasonId }, { token: admin, body: { retired: true } })
  assert.equal(retired.status, 200)
  assert.equal(retired.json.retired, true)
  assert.equal(retired.json.name, name, 'PATCH leaves unsent fields alone')

  const rows = await auditRows('member_drop_reason', Number(memberDropReasonId))
  assert.deepEqual(rows.map(r => r.action), ['create', 'update'])

  const del = await vgCall('deleteMemberDropReason', { memberDropReasonId }, { token: admin })
  assert.equal(del.status, 204)
  const gone = await vgCall('patchMemberDropReason', { memberDropReasonId }, { token: admin, body: { name: 'x' } })
  assert.equal(gone.status, 404)
})

test('duplicate drop-reason name -> 409', async () => {
  const name = uniq('Dup')
  assert.equal((await vgCall('createMemberDropReason', {}, { token: admin, body: { name } })).status, 201)
  assert.equal((await vgCall('createMemberDropReason', {}, { token: admin, body: { name } })).status, 409)
})

test('reason in use cannot be deleted', async () => {
  const created = await vgCall('createMemberDropReason', {}, { token: admin, body: { name: uniq('In use') } })
  const memberDropReasonId = created.json.memberDropReasonId
  const p = await vgCall('createPerson', {}, {
    token: staff, body: { villageId: String(villages.scratch.id), firstName: 'Throwaway', lastName: 'DropHeld' },
  })
  assert.equal(p.status, 201)
  // The CHECK allows a reason only on a Dropped member: set both together.
  await withDb(conn => conn.query(
    "INSERT INTO member (personId, status, dropReasonId) VALUES (?, 'Dropped', ?)", [p.json.personId, memberDropReasonId]))

  const list = await vgCall('getMemberDropReasons', {}, { token: staff })
  assert.equal(list.json.find(r => r.memberDropReasonId === memberDropReasonId).holderCount, 1)

  const del = await vgCall('deleteMemberDropReason', { memberDropReasonId }, { token: admin })
  assert.equal(del.status, 409)
  assert.match(JSON.stringify(del.json), /1 member/)
})

test('staff can read, only admin writes', async () => {
  const list = await vgCall('getMemberDropReasons', {}, { token: staff })
  assert.equal(list.status, 200)
  const create = await vgCall('createMemberDropReason', {}, { token: staff, body: { name: uniq('Nope') } })
  assert.equal(create.status, 403)
})
