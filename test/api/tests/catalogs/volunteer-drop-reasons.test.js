import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { withDb } from '../../lib/db.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'
import { auditRows } from '../audit/lib.js'

// /volunteer-drop-reasons: admin-managed catalog. Any staff user reads; only
// drop_reason:admin writes (Admin's '*'). Names are unique; a reason a member
// carries can't be deleted (409 with the count).
const staff = tokens.users.staff
const admin = tokens.users.admin
const uniq = (s) => `${s} ${Date.now()}-${Math.round(Math.random() * 1e6)}`

test('admin creates, renames, retires and deletes a reason', async () => {
  const name = uniq('Moved away')
  const created = await vgCall('createVolunteerDropReason', {}, { token: admin, body: { name, description: 'Left the area' } })
  assert.equal(created.status, 201)
  assert.equal(created.json.name, name)
  assert.equal(created.json.description, 'Left the area')
  assert.equal(created.json.retired, false)
  assert.equal(created.json.holderCount, 0)
  const volunteerDropReasonId = created.json.volunteerDropReasonId

  const retired = await vgCall('patchVolunteerDropReason', { volunteerDropReasonId }, { token: admin, body: { retired: true } })
  assert.equal(retired.status, 200)
  assert.equal(retired.json.retired, true)
  assert.equal(retired.json.name, name, 'PATCH leaves unsent fields alone')

  const rows = await auditRows('volunteer_drop_reason', Number(volunteerDropReasonId))
  assert.deepEqual(rows.map(r => r.action), ['create', 'update'])

  const del = await vgCall('deleteVolunteerDropReason', { volunteerDropReasonId }, { token: admin })
  assert.equal(del.status, 204)
  const gone = await vgCall('patchVolunteerDropReason', { volunteerDropReasonId }, { token: admin, body: { name: 'x' } })
  assert.equal(gone.status, 404)
})

test('duplicate drop-reason name -> 409', async () => {
  const name = uniq('Dup')
  assert.equal((await vgCall('createVolunteerDropReason', {}, { token: admin, body: { name } })).status, 201)
  assert.equal((await vgCall('createVolunteerDropReason', {}, { token: admin, body: { name } })).status, 409)
})

test('reason in use cannot be deleted', async () => {
  const created = await vgCall('createVolunteerDropReason', {}, { token: admin, body: { name: uniq('In use') } })
  const volunteerDropReasonId = created.json.volunteerDropReasonId
  const p = await vgCall('createPerson', {}, {
    token: staff, body: { villageId: String(villages.scratch.id), firstName: 'Throwaway', lastName: 'DropHeld' },
  })
  assert.equal(p.status, 201)
  // The CHECK allows a reason only on a Dropped volunteer: set both together.
  await withDb(conn => conn.query(
    "INSERT INTO volunteer (personId, status, dropReasonId) VALUES (?, 'Dropped', ?)", [p.json.personId, volunteerDropReasonId]))

  const list = await vgCall('getVolunteerDropReasons', {}, { token: staff })
  assert.equal(list.json.find(r => r.volunteerDropReasonId === volunteerDropReasonId).holderCount, 1)

  const del = await vgCall('deleteVolunteerDropReason', { volunteerDropReasonId }, { token: admin })
  assert.equal(del.status, 409)
  assert.match(JSON.stringify(del.json), /1 volunteer/)
})

test('staff can read, only admin writes', async () => {
  const list = await vgCall('getVolunteerDropReasons', {}, { token: staff })
  assert.equal(list.status, 200)
  const create = await vgCall('createVolunteerDropReason', {}, { token: staff, body: { name: uniq('Nope') } })
  assert.equal(create.status, 403)
})
