import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// The Hub persons list shows every role status, so the summary row carries
// member/volunteer status, the volunteer's pause, circles and isVeteran.
// Non-current statuses (Pending/Dropped, and anything on a deceased person)
// are gated by read_inactive; isVeteran by read_demographics.
const scratch = String(villages.scratch.id)
const staff = tokens.users.staff
const sc = tokens.users.sc
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

async function makePerson (extra = {}) {
  const lastName = uniq('Roles')
  const p = await vgCall('createPerson', {}, { token: staff, body: {
    villageId: scratch, firstName: 'Summary', lastName, ...extra,
  } })
  assert.equal(p.status, 201)
  return { personId: p.json.personId, lastName }
}
const putMember = (personId, status) => vgCall('putPersonMember', { personId }, { token: staff, body: { status, memberLevel: 'Household', joinDate: '2026-01-15' } })
const putVolunteer = (personId, status) => vgCall('putPersonVolunteer', { personId }, { token: staff, body: { status } })
async function rowFor (token, { personId, lastName }) {
  const res = await vgCall('getPersons', { lastName }, { token })
  assert.equal(res.status, 200)
  const row = res.json.find(r => r.personId === personId)
  assert.ok(row, 'person is listed')
  return row
}

test('staff sees stored statuses', async () => {
  const p = await makePerson()
  assert.equal((await putMember(p.personId, 'Pending')).status, 200)
  assert.equal((await putVolunteer(p.personId, 'Active')).status, 200)
  const row = await rowFor(staff, p)
  assert.strictEqual(row.memberStatus, 'Pending')
  assert.strictEqual(row.volunteerStatus, 'Active')
})

test('sc sees only current roles', async () => {
  const p = await makePerson()
  assert.equal((await putMember(p.personId, 'Pending')).status, 200)
  assert.equal((await putVolunteer(p.personId, 'Active')).status, 200)
  const row = await rowFor(sc, p)
  assert.strictEqual(row.memberStatus, null)
  assert.strictEqual(row.volunteerStatus, 'Active')
})

test('dropped member', async () => {
  const p = await makePerson()
  assert.equal((await putMember(p.personId, 'Active')).status, 200)
  const reason = await vgCall('createMemberDropReason', {}, { token: tokens.users.admin, body: { name: uniq('Moved away') } })
  assert.equal(reason.status, 201)
  const dropped = await vgCall('patchPersonMember', { personId: p.personId }, { token: staff, body: { status: 'Dropped', dropReasonId: reason.json.memberDropReasonId } })
  assert.equal(dropped.status, 200)
  assert.strictEqual((await rowFor(staff, p)).memberStatus, 'Dropped')
  assert.strictEqual((await rowFor(sc, p)).memberStatus, null)
})

test('deceased keeps stored status for staff, nothing for sc', async () => {
  const p = await makePerson()
  assert.equal((await putMember(p.personId, 'Active')).status, 200)
  assert.equal((await putVolunteer(p.personId, 'Active')).status, 200)
  assert.equal((await vgCall('patchPerson', { personId: p.personId }, { token: staff, body: { deceased: true } })).status, 200)
  const s = await rowFor(staff, p)
  assert.strictEqual(s.memberStatus, 'Active')
  assert.strictEqual(s.volunteerStatus, 'Active')
  assert.strictEqual(s.deceased, true)
  const c = await rowFor(sc, p)
  assert.strictEqual(c.memberStatus, null)
  assert.strictEqual(c.volunteerStatus, null)
})

test('sc gets no pause for a volunteer who is not current', async () => {
  const p = await makePerson()
  assert.equal((await putVolunteer(p.personId, 'Active')).status, 200)
  const pause = await vgCall('putPersonVolunteerPause', { personId: p.personId }, { token: staff, body: { scope: 'window', startDate: '2030-01-01', endDate: '2030-01-31' } })
  assert.equal(pause.status, 200)
  assert.deepEqual((await rowFor(sc, p)).volunteerPause, { startDate: '2030-01-01', endDate: '2030-01-31', scope: 'window' })
  assert.equal((await vgCall('patchPerson', { personId: p.personId }, { token: staff, body: { deceased: true } })).status, 200)
  const s = await rowFor(staff, p)
  assert.strictEqual(s.volunteerStatus, 'Active')
  assert.deepEqual(s.volunteerPause, { startDate: '2030-01-01', endDate: '2030-01-31', scope: 'window' })
  const c = await rowFor(sc, p)
  assert.strictEqual(c.volunteerStatus, null)
  assert.strictEqual(c.volunteerPause, null)
})

test('pause and circles ride along', async () => {
  const p = await makePerson({ circles: ['1'] })
  assert.equal((await putVolunteer(p.personId, 'Active')).status, 200)
  const pause = await vgCall('putPersonVolunteerPause', { personId: p.personId }, { token: staff, body: { scope: 'window', startDate: '2030-01-01', endDate: '2030-01-31' } })
  assert.equal(pause.status, 200)
  const row = await rowFor(staff, p)
  assert.deepEqual(row.volunteerPause, { startDate: '2030-01-01', endDate: '2030-01-31', scope: 'window' })
  assert.deepEqual(row.circles, [{ circleId: '1', name: 'Circle of Pride' }])

  const bare = await rowFor(staff, await makePerson())
  assert.strictEqual(bare.volunteerPause, null)
  assert.deepEqual(bare.circles, [])
})

test('isVeteran is gated', async () => {
  const p = await makePerson({ isVeteran: true })
  assert.strictEqual((await rowFor(staff, p)).isVeteran, true)
  assert.ok(!('isVeteran' in await rowFor(sc, p)))
})
