import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// deletePerson refuses (422) a person who still has a member, volunteer or
// donor record. Before, a member/volunteer row hit the FK as a raw 500, and the
// client's Delete guard was the only check.
const scratch = String(villages.scratch.id)
const { staff, admin } = tokens.users
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

async function makePerson () {
  const res = await vgCall('createPerson', {}, { token: staff, body: { villageId: scratch, firstName: 'Del', lastName: uniq('Del') } })
  assert.equal(res.status, 201)
  return res.json.personId
}
const del = (personId) => vgCall('deletePerson', { personId }, { token: staff })
const exists = async (personId) => (await vgCall('getPerson', { personId }, { token: staff })).status === 200

test('a donor-only person cannot be deleted', async () => {
  const personId = await makePerson()
  assert.equal((await vgCall('putPersonDonor', { personId }, { token: admin, body: { lglConstituentId: '1' } })).status, 200)
  assert.equal((await del(personId)).status, 422)
  assert.ok(await exists(personId))
})

test('a member cannot be deleted', async () => {
  const personId = await makePerson()
  assert.equal((await vgCall('putPersonMember', { personId }, { token: staff, body: { status: 'Active', memberLevel: 'Household', joinDate: '2026-01-15' } })).status, 200)
  assert.equal((await del(personId)).status, 422)
  assert.ok(await exists(personId))
})

test('a volunteer cannot be deleted', async () => {
  const personId = await makePerson()
  assert.equal((await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { status: 'Active' } })).status, 200)
  assert.equal((await del(personId)).status, 422)
  assert.ok(await exists(personId))
})

test('after the donor record is removed the person can be deleted', async () => {
  const personId = await makePerson()
  assert.equal((await vgCall('putPersonDonor', { personId }, { token: admin, body: { lglConstituentId: '2' } })).status, 200)
  assert.equal((await vgCall('deletePersonDonor', { personId }, { token: admin })).status, 204)
  assert.equal((await del(personId)).status, 200)
  assert.ok(!(await exists(personId)))
})

// Other references to a person (a service request here) end in the same 422,
// not a raw FK 500.
test('a person a service request still names cannot be deleted', async () => {
  const personId = await makePerson()
  assert.equal((await vgCall('putPersonMember', { personId }, { token: staff, body: { status: 'Active', memberLevel: 'Household', joinDate: '2026-01-15' } })).status, 200)
  const sr = await vgCall('createServiceRequest', {}, { token: tokens.users.sc, body: { villageId: scratch, memberPersonId: personId, serviceDate: '2026-07-11' } })
  assert.equal(sr.status, 201)
  assert.equal((await vgCall('deletePersonMember', { personId }, { token: staff })).status, 204)
  assert.equal((await del(personId)).status, 422)
  assert.ok(await exists(personId))
  await vgCall('patchServiceRequest', { serviceRequestId: sr.json.serviceRequestId }, { token: tokens.users.sc, body: { status: 'Hub cancelled' } })
})
