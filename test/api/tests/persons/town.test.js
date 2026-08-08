import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// person.town round-trip (Task 3). Free-form field, no enum, no validation of
// the value — the resolver/geocode surface lands in a later task. Uses a
// throwaway scratch-village person (create/delete) rather than mutating a
// canonical fixture, matching write.test.js's pattern.
const scratch = String(villages.scratch.id)

test('person.town accepts a value on PATCH and returns it', async () => {
  const created = await vgCall('createPerson', {}, {
    token: tokens.users.staff,
    body: { villageId: scratch, firstName: 'Town', lastName: 'Probe' },
  })
  assert.equal(created.status, 201)
  const personId = created.json.personId

  const patched = await vgCall('patchPerson', { personId }, {
    token: tokens.users.staff,
    body: { town: 'South Kingstown' },
  })
  assert.equal(patched.status, 200)
  assert.equal(patched.json.town, 'South Kingstown')

  await vgCall('deletePerson', { personId }, { token: tokens.users.staff })
})

test('person.town accepts an out-of-region municipality (free-form field)', async () => {
  const created = await vgCall('createPerson', {}, {
    token: tokens.users.staff,
    body: { villageId: scratch, firstName: 'Town', lastName: 'Probe2' },
  })
  assert.equal(created.status, 201)
  const personId = created.json.personId

  const patched = await vgCall('patchPerson', { personId }, {
    token: tokens.users.staff,
    body: { town: 'Seattle' },
  })
  assert.equal(patched.status, 200)
  assert.equal(patched.json.town, 'Seattle')

  await vgCall('deletePerson', { personId }, { token: tokens.users.staff })
})

test('person.town accepts a value on POST create and returns it', async () => {
  const created = await vgCall('createPerson', {}, {
    token: tokens.users.staff,
    body: { villageId: scratch, firstName: 'Town', lastName: 'CreateProbe', town: 'Warwick' },
  })
  assert.equal(created.status, 201)
  assert.equal(created.json.town, 'Warwick')

  await vgCall('deletePerson', { personId: created.json.personId }, { token: tokens.users.staff })
})

test('person.town is null for a person who has none', async () => {
  const created = await vgCall('createPerson', {}, {
    token: tokens.users.staff,
    body: { villageId: scratch, firstName: 'Town', lastName: 'Untouched' },
  })
  assert.equal(created.status, 201)
  const personId = created.json.personId

  const { status, json } = await vgCall('getPerson', { personId }, { token: tokens.users.staff })
  assert.equal(status, 200)
  assert.equal(json.town, null)

  await vgCall('deletePerson', { personId }, { token: tokens.users.staff })
})
