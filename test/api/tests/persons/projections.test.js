import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { persons, members, villages } from '../../setup/fixtures.js'

// Post-#56 the projection enum is `member` / `volunteer` (memberInfo /
// volunteerInfo are gone) and the response property matches the projection
// name. Exercised in an authorized (own-village) context — cross-village
// denial is covered in authz.test.js. Sensitive member fields are key-gated
// per caller permission: householdDues/quickbooksKey need member:read_financial
// (Village Lead / staff), confidentialNotes needs person:read_confidential
// (no village-scoped role holds it).

test('person projection=member expands member details', async () => {
  const { status, json } = await vgCall('getPerson',
    { personId: persons.quahogMember.id, projection: ['member'] },
    { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  // Truthiness, not key presence: the projection is a SQL subquery alias, so the
  // key exists (as null) even when the underlying view/join returns nothing.
  assert.ok(json.member, 'member projected with data (quahogMember is Active)')
  assert.equal(json.member.memberNumber, members.quahog.memberNumber)
  // full_v1 (Steering Committee) lacks member:read_financial — financial keys
  // are omitted from the projected object entirely, not nulled.
  assert.ok(!('householdDues' in json.member), 'financial field hidden without member:read_financial')
})

test('person projection=volunteer expands volunteer details', async () => {
  const { status, json } = await vgCall('getPerson',
    { personId: persons.quahogVolunteer.id, projection: ['volunteer'] },
    { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  // Truthiness for the same reason as member above.
  assert.ok(json.volunteer, 'volunteer projected with data (quahogVolunteer is active)')
  assert.ok(Array.isArray(json.volunteer.capabilities), 'volunteer projection carries a capabilities array')
})

test('member:read_financial (Village Lead) unlocks the financial member keys', async () => {
  const { status, json } = await vgCall('getPerson',
    { personId: persons.quahogMember.id, projection: ['member'] },
    { token: tokens.users.owner_v1 })
  assert.equal(status, 200)
  assert.ok('householdDues' in json.member, 'householdDues key present with member:read_financial')
  // owner_v1 still lacks person:read_confidential — confidential notes stay hidden.
  assert.ok(!('confidentialNotes' in json.member), 'confidentialNotes hidden without person:read_confidential')
})

test('old projection names (memberInfo/volunteerInfo) are gone from the enum -> 400', async () => {
  const { status } = await vgCall('getPerson',
    { personId: persons.quahogMember.id, projection: ['memberInfo'] },
    { token: tokens.users.full_v1 })
  assert.equal(status, 400)
})

// ---- list endpoint projection=detail (export enrichment) ----

test('getPersons projection=detail returns full Person rows, granted villages only', async () => {
  const { status, json } = await vgCall('getPersons',
    { villageId: [String(villages.quahog.id)], lastName: 'Griffin', projection: ['detail'] },
    { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  const peter = json.find(p => p.fullName === persons.quahogMember.fullName)
  assert.ok(peter, 'search predicates still apply with the detail projection')
  assert.equal(peter.street, persons.quahogMember.street)
  // Unseeded columns are still selected: key present, value null.
  assert.ok('birthDate' in peter && 'emergencyContactName' in peter, 'full column set present')
  assert.ok(Array.isArray(peter.communities) && Array.isArray(peter.disabilities), 'aggregate arrays present')
  // Deliberately NOT part of this projection (multi-village gating — see plan/grades log).
  assert.ok(!('member' in peter) && !('volunteer' in peter), 'no member/volunteer on the list endpoint')
  assert.ok(json.every(p => p.village?.villageId === String(villages.quahog.id)), 'rows stay village-clamped')
})

test('getPersons without projection keeps the summary shape', async () => {
  const { status, json } = await vgCall('getPersons',
    { villageId: [String(villages.quahog.id)], lastName: 'Griffin' },
    { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  const peter = json.find(p => p.fullName === persons.quahogMember.fullName)
  assert.ok(peter && !('street' in peter), 'summary rows carry no detail columns')
})
