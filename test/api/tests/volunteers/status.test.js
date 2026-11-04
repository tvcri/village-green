import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { makeVolunteerDropReason } from '../../lib/dropReason.js'
import { villages } from '../../setup/fixtures.js'

// volunteer.status (Active | Pending | Dropped) replaces the old `active` bit.
// The column default (Pending) applies on insert only; an update writes status
// only when the body sends it. Throwaway persons live in the scratch village.
const scratch = String(villages.scratch.id)
const staff = tokens.users.staff

async function makePerson (lastName) {
  const res = await vgCall('createPerson', {}, {
    token: staff, body: { villageId: scratch, firstName: 'Throwaway', lastName },
  })
  assert.equal(res.status, 201, 'precondition: person created')
  return res.json.personId
}

async function listedNames (params = {}) {
  const { status, json } = await vgCall('getVolunteers', params, { token: staff })
  assert.equal(status, 200)
  return json.map(v => v.fullName)
}

test('PUT without status creates a Pending volunteer', async () => {
  const personId = await makePerson('SPending')
  const { status, json } = await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { capabilityIds: ['2'] } })
  assert.equal(status, 200)
  assert.equal(json.volunteer.status, 'Pending')
  assert.ok(!(await listedNames()).includes('SPending, Throwaway'), 'absent without includeInactive')
  assert.ok((await listedNames({ includeInactive: true })).includes('SPending, Throwaway'), 'present with includeInactive')
})

test('PUT without status keeps an existing volunteer\'s status', async () => {
  const personId = await makePerson('SKeep')
  assert.equal((await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { status: 'Active' } })).status, 200)
  const again = await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { notes: 'x' } })
  assert.equal(again.status, 200)
  assert.equal(again.json.volunteer.status, 'Active')
})

test('PATCH moves between all three statuses', async () => {
  const personId = await makePerson('SMove')
  await vgCall('putPersonVolunteer', { personId }, { token: staff, body: {} })
  const set = async (status) => {
    const body = status === 'Dropped' ? { status, dropReasonId: await makeVolunteerDropReason() } : { status }
    const res = await vgCall('patchPersonVolunteer', { personId }, { token: staff, body })
    assert.equal(res.status, 200)
    assert.equal(res.json.volunteer.status, status)
    return (await listedNames()).includes('SMove, Throwaway')
  }
  assert.equal(await set('Active'), true, 'Pending -> Active listed')
  assert.equal(await set('Pending'), false, 'Active -> Pending unlisted')
  assert.equal(await set('Active'), true, 'Pending -> Active listed')
  assert.equal(await set('Dropped'), false, 'Active -> Dropped unlisted')
})

test('status outside the vocabulary is 400', async () => {
  const personId = await makePerson('SBad')
  const res = await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { status: 'Paused' } })
  assert.equal(res.status, 400)
  const patch = await vgCall('patchPersonVolunteer', { personId }, { token: staff, body: { status: 'Paused' } })
  assert.equal(patch.status, 400)
})

test('active is no longer accepted', async () => {
  const personId = await makePerson('SOld')
  await vgCall('putPersonVolunteer', { personId }, { token: staff, body: {} })
  const res = await vgCall('patchPersonVolunteer', { personId }, { token: staff, body: { active: true } })
  assert.equal(res.status, 400)
})
