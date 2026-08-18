import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'
import { withDb } from '../../lib/db.js'
import { auditRows } from './lib.js'

const STAFF_ID = 10
const scratch = String(villages.scratch.id)

async function volunteerIdFor (personId) {
  return withDb(async (conn) => {
    const [rows] = await conn.query('SELECT id FROM volunteer WHERE personId = ?', [personId])
    return rows[0]?.id
  })
}

test('volunteer put(create)/patch/delete audit lifecycle incl. capability set diff', async () => {
  const person = await vgCall('createPerson', {}, {
    token: tokens.users.staff,
    body: { villageId: scratch, firstName: 'Volunteer', lastName: 'Audit' },
  })
  assert.equal(person.status, 201)
  const personId = person.json.personId

  // PUT with no existing row -> action 'create'
  const put = await vgCall('putPersonVolunteer', { personId }, {
    token: tokens.users.staff,
    body: { providerType: 'Volunteer', active: true, capabilityIds: ['1'] },
  })
  assert.equal(put.status, 200)
  const volunteerId = await volunteerIdFor(personId)
  assert.ok(volunteerId)

  let rows = await auditRows('volunteer', volunteerId)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].action, 'create')
  assert.equal(rows[0].userId, STAFF_ID)
  assert.equal(rows[0].changes.snapshot.active, true)
  assert.ok(Array.isArray(rows[0].changes.snapshot.capabilities), 'capabilities snapshot is an array')
  assert.ok(rows[0].changes.snapshot.capabilities.length > 0, 'capabilities snapshot is non-empty')
  assert.ok(rows[0].changes.snapshot.capabilities.every(c => typeof c === 'string'), 'capabilities are names')

  // PATCH clearing capabilities -> set diff has 'removed', no 'added';
  // unchanged scalar (active) absent from diff
  const patch = await vgCall('patchPersonVolunteer', { personId }, {
    token: tokens.users.staff, body: { capabilityIds: [] },
  })
  assert.equal(patch.status, 200)
  rows = await auditRows('volunteer', volunteerId)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].action, 'update')
  assert.ok(rows[1].changes.diff.capabilities.removed.length >= 1, 'capabilities removed from diff')
  assert.ok(!('added' in rows[1].changes.diff.capabilities), 'no added key when nothing was added')
  assert.ok(!('active' in rows[1].changes.diff), 'unchanged scalar not in diff')

  // no-op: repeat the same patch -> no new row
  const noop = await vgCall('patchPersonVolunteer', { personId }, {
    token: tokens.users.staff, body: { capabilityIds: [] },
  })
  assert.equal(noop.status, 200)
  rows = await auditRows('volunteer', volunteerId)
  assert.equal(rows.length, 2, 'no-op patch writes no audit row')

  // DELETE -> snapshot survives; capabilities are already empty from the
  // prior patch (before-shape is read before the junction deletes, but the
  // junction was already cleared) — assert the load-bearing personId instead.
  const del = await vgCall('deletePersonVolunteer', { personId }, { token: tokens.users.staff })
  assert.equal(del.status, 204)
  rows = await auditRows('volunteer', volunteerId)
  assert.equal(rows.length, 3)
  assert.equal(rows[2].action, 'delete')
  assert.deepEqual(rows[2].changes.snapshot.capabilities, [])
  assert.equal(String(rows[2].changes.snapshot.personId), personId)

  await vgCall('deletePerson', { personId }, { token: tokens.users.staff })
})

test('volunteer delete snapshot preserves a non-empty capability set when deleted immediately', async () => {
  const person = await vgCall('createPerson', {}, {
    token: tokens.users.staff,
    body: { villageId: scratch, firstName: 'VolunteerDel', lastName: 'Audit' },
  })
  assert.equal(person.status, 201)
  const personId = person.json.personId

  const put = await vgCall('putPersonVolunteer', { personId }, {
    token: tokens.users.staff,
    body: { providerType: 'Volunteer', active: true, capabilityIds: ['1'] },
  })
  assert.equal(put.status, 200)
  const volunteerId = await volunteerIdFor(personId)

  const del = await vgCall('deletePersonVolunteer', { personId }, { token: tokens.users.staff })
  assert.equal(del.status, 204)

  const rows = await auditRows('volunteer', volunteerId)
  const last = rows[rows.length - 1]
  assert.equal(last.action, 'delete')
  assert.ok(last.changes.snapshot.capabilities.length >= 1, 'delete snapshot preserves the capability set')

  await vgCall('deletePerson', { personId }, { token: tokens.users.staff })
})
