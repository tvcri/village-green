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

// Every test here uses the same token and village and differs only in the
// created body and the probe; the try/finally also deletes the scratch person
// when an assertion throws mid-test.
async function withScratchPerson (body, fn) {
  const created = await vgCall('createPerson', {}, {
    token: tokens.users.staff,
    body: { villageId: scratch, firstName: 'Town', ...body },
  })
  assert.equal(created.status, 201)
  try {
    await fn(created.json.personId, created)
  }
  finally {
    await vgCall('deletePerson', { personId: created.json.personId }, { token: tokens.users.staff })
  }
}

test('person.town accepts a value on PATCH and returns it', async () => {
  await withScratchPerson({ lastName: 'Probe' }, async (personId) => {
    const patched = await vgCall('patchPerson', { personId }, {
      token: tokens.users.staff,
      body: { town: 'South Kingstown' },
    })
    assert.equal(patched.status, 200)
    assert.equal(patched.json.town, 'South Kingstown')
  })
})

test('person.town accepts an out-of-region municipality (free-form field)', async () => {
  await withScratchPerson({ lastName: 'Probe2' }, async (personId) => {
    const patched = await vgCall('patchPerson', { personId }, {
      token: tokens.users.staff,
      body: { town: 'Seattle' },
    })
    assert.equal(patched.status, 200)
    assert.equal(patched.json.town, 'Seattle')
  })
})

test('person.town accepts a value on POST create and returns it', async () => {
  await withScratchPerson({ lastName: 'CreateProbe', town: 'Warwick' }, async (personId, created) => {
    assert.equal(created.json.town, 'Warwick')
  })
})

test('person.town is null for a person who has none', async () => {
  await withScratchPerson({ lastName: 'Untouched' }, async (personId) => {
    const { status, json } = await vgCall('getPerson', { personId }, { token: tokens.users.staff })
    assert.equal(status, 200)
    assert.equal(json.town, null)
  })
})

test('patching an address field without town clears the stored town', async () => {
  await withScratchPerson({ lastName: 'ClearProbe', town: 'Hopkinton' }, async (personId) => {
    const patched = await vgCall('patchPerson', { personId }, {
      token: tokens.users.staff,
      body: { street: '1 New St' },
    })
    assert.equal(patched.status, 200)
    // town derives from the address; an address change that doesn't carry a
    // recalculated town must not keep the old municipality.
    assert.equal(patched.json.town, null)
  })
})

test('patching an address field with town keeps the supplied town', async () => {
  await withScratchPerson({ lastName: 'KeepProbe', town: 'Hopkinton' }, async (personId) => {
    const patched = await vgCall('patchPerson', { personId }, {
      token: tokens.users.staff,
      body: { street: '2 Main St', town: 'Richmond' },
    })
    assert.equal(patched.status, 200)
    assert.equal(patched.json.town, 'Richmond')
  })
})
