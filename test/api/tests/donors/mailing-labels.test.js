import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// Mailing labels take a role list (member, volunteer, donor) and a last-gift
// window. donor in the list needs donor:read (board has person:read but not
// donor:read), the window applies only to the donor clause, and with a
// village chosen only donors of that village appear. Labels are found by sortLastName; every name is invented.
const scratch = String(villages.scratch.id)
const { staff, admin, board } = tokens.users
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`
// Labels merge by address, so only the member and donor A share one; everyone
// else gets a street of their own or they would collapse into A's envelope.
const addressFor = (street) => ({ street, city: 'Testville', state: 'RI', zip: '02901' })

const names = {}
let memberId

async function makePerson (key, { villageId } = {}) {
  names[key] = uniq(`Lbl${key}`)
  const res = await vgCall('createPerson', {}, { token: staff, body: { firstName: 'Label', lastName: names[key], ...addressFor(key === 'A' ? '1 Elm St' : `${key} Oak Ave`), ...(villageId && { villageId }) } })
  assert.equal(res.status, 201)
  return res.json.personId
}
const makeDonor = async (id, lastGiftDate) => {
  const body = { lglConstituentId: uniq('L'), ...(lastGiftDate && { lastGiftDate }) }
  assert.equal((await vgCall('putPersonDonor', { personId: id }, { token: admin, body })).status, 200)
}
const labels = async (params, token = staff) => {
  const res = await vgCall('getMailingLabels', { audience: 'roster', ...params }, { token })
  assert.equal(res.status, 200)
  return res.json.labels
}
const has = (list, key) => list.some(l => l.sortLastName === names[key])

before(async () => {
  // Member and donor A share a last name and an address, so "all" must merge them.
  memberId = await makePerson('A', { villageId: scratch })
  assert.equal((await vgCall('putPersonMember', { personId: memberId }, { token: staff, body: { status: 'Active', memberLevel: 'Household', joinDate: '2026-01-15' } })).status, 200)
  const a = await vgCall('createPerson', {}, { token: staff, body: { firstName: 'Donor', lastName: names.A, ...addressFor('1 Elm St') } })
  assert.equal(a.status, 201)
  await makeDonor(a.json.personId, '2025-06-01')

  await makeDonor(await makePerson('B', { villageId: scratch }), '2014-01-01')
  await makeDonor(await makePerson('C', { villageId: scratch }))

  const d = await makePerson('D', { villageId: scratch })
  await makeDonor(d, '2025-06-01')
  assert.equal((await vgCall('patchPerson', { personId: d }, { token: staff, body: { deceased: true } })).status, 200)

  const e = await makePerson('E', { villageId: scratch })
  assert.equal((await vgCall('putPersonMember', { personId: e }, { token: staff, body: { status: 'Active', memberLevel: 'Household', joinDate: '2026-01-15' } })).status, 200)
  const reason = await vgCall('createMemberDropReason', {}, { token: admin, body: { name: uniq('Reason') } })
  assert.equal(reason.status, 201)
  assert.equal((await vgCall('patchPersonMember', { personId: e }, { token: staff, body: { status: 'Dropped', dropReasonId: reason.json.memberDropReasonId } })).status, 200)
  await makeDonor(e, '2025-01-01')
})

test('donor role labels donors, not the deceased', async () => {
  const l = await labels({ role: ['donor'] })
  for (const k of ['A', 'B', 'C', 'E']) assert.ok(has(l, k), `${k} present`)
  assert.ok(!has(l, 'D'), 'deceased donor absent')
})

test('5-year window drops the old gift and the null gift', async () => {
  const l = await labels({ role: ['donor'], lastGiftWithinYears: 5 })
  assert.ok(has(l, 'A') && has(l, 'E'))
  assert.ok(!has(l, 'B') && !has(l, 'C'))
})

test('all three give the member and donor A one envelope', async () => {
  const l = await labels({ role: ['member', 'volunteer', 'donor'] })
  assert.equal(l.filter(x => x.sortLastName === names.A).length, 1)
})

test('all three never labels the deceased', async () => {
  const l = await labels({ role: ['member', 'volunteer', 'donor'] })
  assert.ok(has(l, 'B'), 'precondition: a living donor is present')
  assert.ok(!has(l, 'D'))
})

test('under all three the window trims donors but not members', async () => {
  const l = await labels({ role: ['member', 'volunteer', 'donor'], lastGiftWithinYears: 1 })
  assert.ok(has(l, 'A'), 'the member is kept whatever their giving')
  assert.ok(!has(l, 'B'), 'the 2014 donor is dropped')
})

test('a dropped member who gives is labelled as a donor', async () => {
  assert.ok(has(await labels({ role: ['donor'] }), 'E'))
})

test('with a village, donors are that village\'s donors only', async () => {
  const everyone = await labels({ role: ['donor'] })
  const scoped = await labels({ role: ['donor'], villageId: scratch })
  // A's member shares the name, so tell them apart by the label's name line:
  // the donor-only envelope reads exactly "Donor <last>".
  const donorA = (list) => list.some(l => l.name === `Donor ${names.A}`)
  assert.ok(donorA(everyone))
  assert.ok(!donorA(scoped), 'a donor with no village is not in a village run')
  assert.ok(has(scoped, 'B'), 'a donor of the village is')
})

test('board gets 403 whenever donor is in the list', async () => {
  for (const role of [['donor'], ['member', 'donor'], ['member', 'volunteer', 'donor']]) {
    assert.equal((await vgCall('getMailingLabels', { audience: 'roster', role }, { token: board })).status, 403)
  }
})

test('422 for a window without donor in the list', async () => {
  assert.equal((await vgCall('getMailingLabels', { audience: 'roster', role: ['member', 'volunteer'], lastGiftWithinYears: 5 }, { token: staff })).status, 422)
})

test('422 for donor in the list on birthday-month', async () => {
  assert.equal((await vgCall('getMailingLabels', { audience: 'birthday-month', role: ['member', 'donor'], month: 6 }, { token: staff })).status, 422)
})

test('volunteer+donor labels donors without requiring a volunteer', async () => {
  const l = await labels({ role: ['volunteer', 'donor'] })
  assert.ok(has(l, 'B') && has(l, 'E'))
  assert.ok(!has(l, 'D'), 'deceased donor absent')
})

test('400 for an empty or duplicated role list', async () => {
  // OAS minItems/uniqueItems reject these before the controller runs. An
  // empty array leaves role off the URL entirely, so that case is the
  // missing-required-param 400.
  for (const role of [[], ['member', 'member']]) {
    assert.equal((await vgCall('getMailingLabels', { audience: 'roster', role }, { token: staff })).status, 400, JSON.stringify(role))
  }
})
