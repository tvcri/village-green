import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// person:read is a scope, not "every person". A caller sees a person only if
// the person has no member/volunteer/donor row, or the caller can read at
// least one of those associations (member:read, volunteer:read, donor:read).
// Only Staff holds donor:read, so donor-only persons are Staff/Admin-only.
// A hidden person is a 404.
const quahog = String(villages.quahog.id)
const { staff, admin, board, sc, full_v1: villageUser } = tokens.users
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

async function makePerson (tag) {
  const lastName = uniq(tag)
  const res = await vgCall('createPerson', {}, { token: staff, body: { villageId: quahog, firstName: 'Vis', lastName } })
  assert.equal(res.status, 201)
  return { personId: res.json.personId, lastName }
}
const putDonor = (personId) => vgCall('putPersonDonor', { personId }, { token: admin, body: { lglConstituentId: uniq('L') } })
const putMember = (personId, status) => vgCall('putPersonMember', { personId }, { token: staff, body: { status, memberLevel: 'Household', joinDate: '2026-01-15' } })
const listed = async (token, { personId, lastName }, extra = {}) => {
  const res = await vgCall('getPersons', { lastName, ...extra }, { token })
  assert.equal(res.status, 200)
  return res.json.find(r => r.personId === personId)
}

let donorOnly, donorMember, bare
before(async () => {
  donorOnly = await makePerson('DonorOnly')
  assert.equal((await putDonor(donorOnly.personId)).status, 200)
  donorMember = await makePerson('DonorMember')
  assert.equal((await putMember(donorMember.personId, 'Pending')).status, 200)
  assert.equal((await putDonor(donorMember.personId)).status, 200)
  bare = await makePerson('Bare')
})

test('staff sees a donor-only person in the list and by id', async () => {
  assert.ok(await listed(staff, donorOnly))
  assert.equal((await vgCall('getPerson', { personId: donorOnly.personId }, { token: staff })).status, 200)
})

test('board and sc cannot see a donor-only person', async () => {
  for (const [label, token] of [['board', board], ['sc', sc]]) {
    assert.equal(await listed(token, donorOnly), undefined, `${label}: not listed`)
    assert.equal((await vgCall('getPerson', { personId: donorOnly.personId }, { token })).status, 404, `${label}: getPerson 404`)
  }
})

test('a village role cannot see a donor-only person in its own village', async () => {
  assert.equal(await listed(villageUser, donorOnly, { villageId: [quahog] }), undefined)
  const all = await vgCall('getVillagePersons', { villageId: quahog }, { token: villageUser })
  assert.equal(all.status, 200)
  assert.ok(!all.json.some(p => p.personId === donorOnly.personId), 'not in getVillagePersons')
  const one = await vgCall('getVillagePerson', { villageId: quahog, personId: donorOnly.personId }, { token: villageUser })
  assert.equal(one.status, 404)
})

test('a pending member who is a donor stays visible to sc', async () => {
  const row = await listed(sc, donorMember)
  assert.ok(row, 'listed')
  assert.strictEqual(row.memberStatus, null)
  assert.ok(!('donor' in row), 'no donor field without donor:read')
})

test('a person with no associations stays visible to board', async () => {
  assert.ok(await listed(board, bare))
  assert.equal((await vgCall('getPerson', { personId: bare.personId }, { token: board })).status, 200)
})

test('staff can add a member role to a donor-only person, who then becomes visible', async () => {
  const p = await makePerson('DonorJoins')
  assert.equal((await putDonor(p.personId)).status, 200)
  assert.equal(await listed(board, p), undefined)
  assert.equal((await putMember(p.personId, 'Active')).status, 200)
  assert.ok(await listed(board, p))
})

test('patching a person the caller cannot see is 404, not 403', async () => {
  const res = await vgCall('patchPerson', { personId: donorOnly.personId }, { token: board, body: { nickname: 'x' } })
  assert.equal(res.status, 404)
})
