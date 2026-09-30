import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// The member projection links a household in both directions: a secondary
// member carries `primaryPerson`, and the primary carries `secondaryPersons`
// (every member whose primaryPersonId points back at it). Throwaway persons
// live in the scratch village (id 4); member:write is federation-scoped, so
// the setup runs as staff.
const scratch = String(villages.scratch.id)
const staff = tokens.users.staff

async function makeMember (lastName, memberBody = {}) {
  const person = await vgCall('createPerson', {}, {
    token: staff, body: { villageId: scratch, firstName: 'Throwaway', lastName },
  })
  assert.equal(person.status, 201, 'precondition: person created')
  const personId = person.json.personId
  const member = await vgCall('putPersonMember', { personId }, {
    token: staff,
    body: { status: 'Active', memberLevel: 'Household', joinDate: '2026-01-15', ...memberBody },
  })
  assert.equal(member.status, 200, 'precondition: member role granted')
  return { personId, fullName: member.json.fullName }
}

async function memberProjection (personId) {
  const { status, json } = await vgCall('getPerson',
    { personId, projection: ['member'] }, { token: staff })
  assert.equal(status, 200)
  return json.member
}

test('the primary member lists its secondaries; the secondary names its primary', async () => {
  const primary = await makeMember('HouseholdPrimary')
  const secondary = await makeMember('HouseholdSecondary', {
    primaryPersonId: primary.personId, secondaryType: 'Spouse',
  })

  const primaryMember = await memberProjection(primary.personId)
  assert.deepEqual(primaryMember.secondaryPersons, [
    { personId: secondary.personId, fullName: secondary.fullName, secondaryType: 'Spouse' },
  ])

  const secondaryMember = await memberProjection(secondary.personId)
  assert.equal(secondaryMember.primaryPerson.personId, primary.personId)
  assert.deepEqual(secondaryMember.secondaryPersons, [], 'a secondary has no secondaries of its own')
})

test('a member with no household links projects an empty secondaryPersons array', async () => {
  const solo = await makeMember('HouseholdSolo')
  const member = await memberProjection(solo.personId)
  assert.deepEqual(member.secondaryPersons, [], 'empty array, not null')
})
