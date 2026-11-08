import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// Hub person list rows carry `donor` for donor:read holders: the LGL
// constituent ID and last gift date, or null for a non-donor. Others get no
// key. ?lglConstituentId= matches exactly and requires donor:read, because a
// filter on donor data would otherwise reveal which visible members donate.
const quahog = String(villages.quahog.id)
const { staff, admin, board, full_v1: villageUser } = tokens.users
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

async function makePerson (lastName) {
  const res = await vgCall('createPerson', {}, { token: staff, body: { villageId: quahog, firstName: 'List', lastName } })
  assert.equal(res.status, 201)
  return res.json.personId
}
const putDonor = (personId, body) => vgCall('putPersonDonor', { personId }, { token: admin, body })

test('staff rows carry donor; a non-donor row has donor null', async () => {
  const lastName = uniq('ListRow')
  const donorId = await makePerson(lastName)
  const plainId = await makePerson(lastName)
  assert.equal((await putDonor(donorId, { lglConstituentId: 'C1', lastGiftDate: '2023-06-01' })).status, 200)
  const res = await vgCall('getPersons', { lastName }, { token: staff })
  assert.equal(res.status, 200)
  assert.deepEqual(res.json.find(r => r.personId === donorId).donor, { lglConstituentId: 'C1', lastGiftDate: '2023-06-01' })
  assert.strictEqual(res.json.find(r => r.personId === plainId).donor, null)
})

test('board rows omit donor', async () => {
  const res = await vgCall('getPersons', {}, { token: board })
  assert.equal(res.status, 200)
  assert.ok(res.json.length > 0)
  assert.ok(res.json.every(r => !('donor' in r)))
})

test('the constituent filter returns both persons of a couple', async () => {
  const lgl = uniq('LGL')
  const a = await makePerson(uniq('CoupleA'))
  const b = await makePerson(uniq('CoupleB'))
  assert.equal((await putDonor(a, { lglConstituentId: lgl })).status, 200)
  assert.equal((await putDonor(b, { lglConstituentId: lgl })).status, 200)
  const res = await vgCall('getPersons', { lglConstituentId: lgl }, { token: staff })
  assert.equal(res.status, 200)
  assert.deepEqual(res.json.map(r => r.personId).sort(), [a, b].sort())
})

test('the constituent filter matches exactly', async () => {
  const lgl = uniq('Exact')
  assert.equal((await putDonor(await makePerson(uniq('Exact')), { lglConstituentId: lgl })).status, 200)
  const res = await vgCall('getPersons', { lglConstituentId: lgl.slice(0, -1) }, { token: staff })
  assert.equal(res.status, 200)
  assert.deepEqual(res.json, [])
})

test('the constituent filter requires donor:read', async () => {
  assert.equal((await vgCall('getPersons', { lglConstituentId: 'x' }, { token: board })).status, 403)
  assert.equal((await vgCall('getPersons', { villageId: [quahog], lglConstituentId: 'x' }, { token: villageUser })).status, 403)
})

// An empty filter would be skipped and return everyone — reads as matches.
test('an empty constituent filter is rejected', async () => {
  assert.equal((await vgCall('getPersons', { lglConstituentId: '' }, { token: staff })).status, 400)
})
