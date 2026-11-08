import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'
import { villages } from '../../setup/fixtures.js'

// Donor writes: PUT (create/replace) and DELETE /persons/{id}/donor, gated by
// donor:write. No role is granted donor:write — Admin holds it through the
// wildcard, which is how the LGL import runs. Staff reads donors (donor:read)
// but cannot write them: there is no donor UI.
const staff = tokens.users.staff
const admin = tokens.users.admin
const scratch = String(villages.scratch.id)
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

async function makePerson (villageId = null) {
  const res = await vgCall('createPerson', {}, { token: staff, body: {
    villageId, firstName: 'Donor', lastName: uniq('Write'),
  } })
  assert.equal(res.status, 201)
  return res.json.personId
}
const putDonor = (personId, body, token = admin) => vgCall('putPersonDonor', { personId }, { token, body })
const delDonor = (personId, token = admin) => vgCall('deletePersonDonor', { personId }, { token })
const readDonor = async (personId, token = staff) => {
  const res = await vgCall('getPerson', { personId, projection: ['donor'] }, { token })
  assert.equal(res.status, 200)
  return res.json
}

test('put creates a donor and the projection reads it back', async () => {
  const personId = await makePerson()
  const res = await putDonor(personId, { lglConstituentId: '12345', lastGiftDate: '2024-12-31' })
  assert.equal(res.status, 200)
  assert.equal(typeof res.json.donor.donorId, 'string')
  assert.deepEqual(res.json.donor, {
    donorId: res.json.donor.donorId, personId, lglConstituentId: '12345', lastGiftDate: '2024-12-31',
  })
  assert.deepEqual((await readDonor(personId)).donor, res.json.donor)
})

test('put twice replaces the one donor row', async () => {
  const personId = await makePerson()
  assert.equal((await putDonor(personId, { lglConstituentId: '111', lastGiftDate: '2020-01-01' })).status, 200)
  const again = await putDonor(personId, { lglConstituentId: '999', lastGiftDate: null })
  assert.equal(again.status, 200)
  const [[{ n }]] = await withDb(db => db.query('SELECT COUNT(*) AS n FROM donor WHERE personId = ?', [Number(personId)]))
  assert.equal(n, 1)
  const { donor } = await readDonor(personId)
  assert.equal(donor.lglConstituentId, '999')
  assert.strictEqual(donor.lastGiftDate, null)
})

test('a person with no village can be a donor', async () => {
  const personId = await makePerson(null)
  assert.equal((await putDonor(personId, { lglConstituentId: '42' })).status, 200)
})

test('staff cannot write donors', async () => {
  const personId = await makePerson()
  assert.equal((await putDonor(personId, { lglConstituentId: '7' }, staff)).status, 403)
  assert.equal((await putDonor(personId, { lglConstituentId: '7' })).status, 200)
  assert.equal((await delDonor(personId, staff)).status, 403)
})

test('donor projection is omitted without donor:read', async () => {
  // An Active member too, so Board can see the person at all.
  const personId = await makePerson(scratch)
  assert.equal((await vgCall('putPersonMember', { personId }, { token: staff, body: { status: 'Active', memberLevel: 'Household', joinDate: '2026-01-15' } })).status, 200)
  assert.equal((await putDonor(personId, { lglConstituentId: '8' })).status, 200)
  const asBoard = await readDonor(personId, tokens.users.board)
  assert.ok(!('donor' in asBoard), 'board gets no donor key')
  assert.equal((await readDonor(personId)).donor.lglConstituentId, '8')
})

// A second delete is 404, like deletePersonMember / deletePersonVolunteer.
test('delete removes the donor row; deleting again is 404', async () => {
  const personId = await makePerson()
  assert.equal((await putDonor(personId, { lglConstituentId: '5', lastGiftDate: '2025-05-05' })).status, 200)
  assert.equal((await delDonor(personId)).status, 204)
  assert.strictEqual((await readDonor(personId)).donor, null)
  assert.equal((await delDonor(personId)).status, 404)
})

test('put on an unknown person is 404', async () => {
  assert.equal((await putDonor('999999', { lglConstituentId: '1' })).status, 404)
})
