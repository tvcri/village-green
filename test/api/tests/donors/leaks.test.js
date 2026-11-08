import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, persons } from '../../setup/fixtures.js'

// Paths outside the person reads that could reveal a donor-only person or
// donor status to a caller without donor:read.
const quahog = String(villages.quahog.id)
const { staff, admin, board, sc } = tokens.users
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

async function makePerson () {
  const res = await vgCall('createPerson', {}, { token: staff, body: { villageId: quahog, firstName: 'Leak', lastName: uniq('Leak') } })
  assert.equal(res.status, 201)
  return res.json.personId
}

let donorOnly, plain
before(async () => {
  donorOnly = await makePerson()
  assert.equal((await vgCall('putPersonDonor', { personId: donorOnly }, { token: admin, body: { lglConstituentId: uniq('L') } })).status, 200)
  plain = await makePerson()
})

// Permission precedes existence, so 403 vs 404 can't reveal donor status.
test('deletePersonDonor answers 403 to a caller without donor:write, donor or not', async () => {
  assert.equal((await vgCall('deletePersonDonor', { personId: donorOnly }, { token: board })).status, 403)
  assert.equal((await vgCall('deletePersonDonor', { personId: plain }, { token: board })).status, 403)
})

// A request's member and volunteer must be persons with a member or volunteer
// record, so request reads (shown to every sr:read holder and to VSS
// volunteers) can never carry a donor-only person.
test('a service request cannot name a donor-only person as member', async () => {
  for (const token of [sc, staff]) {
    const res = await vgCall('createServiceRequest', {}, { token, body: { villageId: quahog, memberPersonId: donorOnly, serviceDate: '2026-07-11' } })
    assert.equal(res.status, 422)
  }
})

test('a service request cannot name a donor-only person as volunteer', async () => {
  const res = await vgCall('createServiceRequest', {}, { token: sc, body: {
    villageId: quahog, memberPersonId: String(persons.quahogMember.id), volunteerPersonId: donorOnly, serviceDate: '2026-07-11',
  } })
  assert.equal(res.status, 422)
})

test('patching a service request onto a donor-only volunteer is refused', async () => {
  const created = await vgCall('createServiceRequest', {}, { token: sc, body: {
    villageId: quahog, memberPersonId: String(persons.quahogMember.id), serviceDate: '2026-07-11',
  } })
  assert.equal(created.status, 201)
  const { serviceRequestId } = created.json
  const res = await vgCall('patchServiceRequest', { serviceRequestId }, { token: sc, body: { volunteerPersonId: donorOnly } })
  assert.equal(res.status, 422)
  await vgCall('patchServiceRequest', { serviceRequestId }, { token: sc, body: { status: 'Hub cancelled' } })
})

// The member/volunteer PUTs looked the person up without the caller, so a
// caller who can't see a donor-only person got 403 (exists) where a missing
// id gets 404 — together with getPerson's 404, that marked donor-only ids.
test('member and volunteer PUTs answer a donor-only id like a missing one', async () => {
  for (const op of ['putPersonMember', 'putPersonVolunteer']) {
    const hidden = await vgCall(op, { personId: donorOnly }, { token: board, body: { status: 'Active', memberLevel: 'Household', joinDate: '2026-01-15' } })
    const missing = await vgCall(op, { personId: '999999' }, { token: board, body: { status: 'Active', memberLevel: 'Household', joinDate: '2026-01-15' } })
    assert.equal(hidden.status, missing.status, `${op}: donor-only vs missing`)
  }
})

// Only ids that change are checked: a full-form edit of an old request whose
// member has since lost their member record must still save.
test('editing a request whose member lost their member record still saves', async () => {
  const personId = await makePerson()
  assert.equal((await vgCall('putPersonMember', { personId }, { token: staff, body: { status: 'Active', memberLevel: 'Household', joinDate: '2026-01-15' } })).status, 200)
  const created = await vgCall('createServiceRequest', {}, { token: sc, body: { villageId: quahog, memberPersonId: personId, serviceDate: '2026-07-11' } })
  assert.equal(created.status, 201)
  const { serviceRequestId } = created.json
  assert.equal((await vgCall('deletePersonMember', { personId }, { token: staff })).status, 204)
  const res = await vgCall('patchServiceRequest', { serviceRequestId }, { token: sc, body: { memberPersonId: personId, serviceDate: '2026-07-12' } })
  assert.equal(res.status, 200)
  await vgCall('patchServiceRequest', { serviceRequestId }, { token: sc, body: { status: 'Hub cancelled' } })
})
