import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// A Pending volunteer behaves like a Dropped one everywhere except displays:
// only status = 'Active' is a current volunteer. Mirrors persons/deceased-reach.
const scratch = String(villages.scratch.id)
const staff = tokens.users.staff
const admin = tokens.users.admin
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

let personId; let lastName; let positionId; let holderId

before(async () => {
  lastName = uniq('Pend')
  const p = await vgCall('createPerson', {}, { token: staff, body: {
    villageId: scratch, firstName: 'Pending', lastName, street: '1 Test St', city: 'Testville', state: 'RI', zip: '02901',
  } })
  assert.equal(p.status, 201)
  personId = p.json.personId
  assert.equal((await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { status: 'Active', capabilityIds: ['1'] } })).status, 200)
  positionId = (await vgCall('createPosition', {}, { token: admin, body: { name: uniq('Pend pos'), scope: 'village' } })).json.positionId
  const add = await vgCall('patchPositionHolders', { positionId }, { token: staff, body: { add: [{ personId, villageId: scratch }] } })
  assert.equal(add.status, 200)
  holderId = add.json[0].volunteerPositionId
  const labels = await vgCall('getMailingLabels', { audience: 'roster', role: 'either' }, { token: staff })
  assert.ok(labels.json.labels.some(l => l.sortLastName === lastName), 'precondition: labelled while Active')
  const patch = await vgCall('patchPersonVolunteer', { personId }, { token: staff, body: { status: 'Pending' } })
  assert.equal(patch.status, 200)
})

test('mailing labels skip a Pending volunteer', async () => {
  const res = await vgCall('getMailingLabels', { audience: 'roster', role: 'either' }, { token: staff })
  assert.equal(res.status, 200)
  assert.ok(!res.json.labels.some(l => l.sortLastName === lastName))
})

test('volunteer roster omits a Pending volunteer unless includeInactive', async () => {
  const listed = async (params) => (await vgCall('getVolunteers', params, { token: staff })).json.find(v => v.personId === personId)
  assert.equal(await listed({}), undefined)
  const row = await listed({ includeInactive: true })
  assert.ok(row)
  assert.equal(row.status, 'Pending')
})

test('village volunteer list omits a Pending volunteer', async () => {
  const res = await vgCall('getVillageVolunteers', { villageId: scratch }, { token: staff })
  assert.equal(res.status, 200)
  assert.ok(!res.json.some(v => v.personId === personId))
})

test('position holders hide a Pending volunteer', async () => {
  const holders = async (params) => (await vgCall('getPositionHolders', { positionId, ...params }, { token: staff })).json
  assert.ok(!(await holders({})).some(h => h.person.personId === personId))
  assert.ok((await holders({ includeInactive: true })).some(h => h.volunteerPositionId === holderId))
})

test('metrics roster omits an idle Pending volunteer', async () => {
  const res = await vgCall('getMetaMetricsPersons', { start: '2026-01-01', end: '2026-12-31' }, { token: tokens.users.board })
  assert.equal(res.status, 200)
  assert.ok(!res.json.volunteers.some(v => v.personId === personId))
})
