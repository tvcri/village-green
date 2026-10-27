import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// A deceased person stays Active in member/volunteer (death never writes a
// role status) but is never "current": mailing labels, rosters, position
// holder lists and metrics rosters all treat them as not current.
const scratch = String(villages.scratch.id)
const staff = tokens.users.staff
const admin = tokens.users.admin
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

let personId; let lastName; let positionId; let holderId

before(async () => {
  lastName = uniq('Reach')
  const p = await vgCall('createPerson', {}, { token: staff, body: {
    villageId: scratch, firstName: 'Deceased', lastName, street: '1 Test St', city: 'Testville', state: 'RI', zip: '02901',
  } })
  assert.equal(p.status, 201)
  personId = p.json.personId
  assert.equal((await vgCall('putPersonMember', { personId }, { token: staff, body: { status: 'Active', memberLevel: 'Household', joinDate: '2026-01-15' } })).status, 200)
  assert.equal((await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { status: 'Active' } })).status, 200)
  positionId = (await vgCall('createPosition', {}, { token: admin, body: { name: uniq('Reach pos'), scope: 'village' } })).json.positionId
  const add = await vgCall('patchPositionHolders', { positionId }, { token: staff, body: { add: [{ personId, villageId: scratch }] } })
  assert.equal(add.status, 200)
  holderId = add.json[0].volunteerPositionId
})

const labelsHave = async () => {
  const res = await vgCall('getMailingLabels', { audience: 'roster', role: 'either' }, { token: staff })
  assert.equal(res.status, 200)
  return res.json.labels.some(l => l.sortLastName === lastName)
}
const mark = (deceased) => vgCall('patchPerson', { personId }, { token: staff, body: { deceased } })

test('mailing labels skip the deceased', async () => {
  assert.equal(await labelsHave(), true, 'precondition: labelled while alive')
  assert.equal((await mark(true)).status, 200)
  assert.equal(await labelsHave(), false)
})

test('volunteer roster flags the deceased', async () => {
  const listed = async (params) => (await vgCall('getVolunteers', params, { token: staff })).json.find(v => v.personId === personId)
  assert.equal(await listed({}), undefined, 'absent without includeInactive')
  const row = await listed({ includeInactive: true })
  assert.ok(row, 'present with includeInactive')
  assert.strictEqual(row.deceased, true)
})

test('position holders hide the deceased', async () => {
  const holders = async (params) => (await vgCall('getPositionHolders', { positionId, ...params }, { token: staff })).json
  assert.ok(!(await holders({})).some(h => h.person.personId === personId))
  const all = await holders({ includeInactive: true })
  const row = all.find(h => h.volunteerPositionId === holderId)
  assert.ok(row, 'listed with includeInactive')
  assert.strictEqual(row.person.deceased, true)
})

test('metrics roster flags the deceased', async () => {
  // Give the deceased person Completed activity so they appear despite not being current.
  const created = await vgCall('createServiceRequest', {}, { token: tokens.users.sc, body: {
    villageId: scratch, memberPersonId: personId, volunteerPersonId: personId, serviceDate: '2026-01-20',
  } })
  assert.equal(created.status, 201)
  const { withDb } = await import('../../lib/db.js')
  await withDb(c => c.query("UPDATE service_request SET status = 'Completed' WHERE id = ?", [Number(created.json.serviceRequestId)]))
  const res = await vgCall('getMetaMetricsPersons', { start: '2026-01-01', end: '2026-12-31' }, { token: tokens.users.board })
  assert.equal(res.status, 200)
  const m = res.json.members.find(r => r.personId === personId)
  const v = res.json.volunteers.find(r => r.personId === personId)
  assert.strictEqual(m.deceased, true)
  assert.strictEqual(v.deceased, true)
})

test('metrics roster omits an idle deceased person', async () => {
  const q = await vgCall('createPerson', {}, { token: staff, body: { villageId: scratch, firstName: 'Idle', lastName: uniq('Idle') } })
  await vgCall('putPersonMember', { personId: q.json.personId }, { token: staff, body: { status: 'Active', memberLevel: 'Household', joinDate: '2026-01-15' } })
  const find = async () => (await vgCall('getMetaMetricsPersons', { start: '2026-01-01', end: '2026-12-31' }, { token: tokens.users.board })).json.members.find(r => r.personId === q.json.personId)
  assert.strictEqual((await find())?.deceased, false)
  await vgCall('patchPerson', { personId: q.json.personId }, { token: staff, body: { deceased: true } })
  assert.equal(await find(), undefined)
})
