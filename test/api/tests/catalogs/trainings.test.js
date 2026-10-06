import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'
import { auditRows } from '../audit/lib.js'

// /trainings: staff-owned catalog (spec §4.1). Any staff user reads; only
// training:admin (Staff role, Admin '*') writes. Names are unique; an entry
// with holders can't be deleted (409 with the count).
const staff = tokens.users.staff
const scratch = String(villages.scratch.id)
const uniq = (s) => `${s} ${Date.now()}-${Math.round(Math.random() * 1e6)}`

async function makeVolunteer (lastName) {
  const p = await vgCall('createPerson', {}, {
    token: staff, body: { villageId: scratch, firstName: 'Throwaway', lastName },
  })
  assert.equal(p.status, 201)
  const put = await vgCall('putPersonVolunteer', { personId: p.json.personId }, {
    token: staff, body: { active: true },
  })
  assert.equal(put.status, 200)
  return p.json.personId
}

test('staff creates, renames and deletes a training', async () => {
  const name = uniq('CPR')
  const created = await vgCall('createTraining', {}, { token: staff, body: { name, description: 'Hands-only CPR' } })
  assert.equal(created.status, 201)
  assert.equal(created.json.name, name)
  assert.equal(created.json.description, 'Hands-only CPR')
  assert.equal(created.json.holderCount, 0)
  const trainingId = created.json.trainingId

  const list = await vgCall('getTrainings', {}, { token: tokens.users.full_v1 })
  assert.equal(list.status, 200)
  assert.ok(list.json.some(t => t.trainingId === trainingId), 'village staff can read the catalog')

  const renamed = await vgCall('patchTraining', { trainingId }, { token: staff, body: { name: `${name} (renamed)` } })
  assert.equal(renamed.status, 200)
  assert.equal(renamed.json.name, `${name} (renamed)`)
  assert.equal(renamed.json.description, 'Hands-only CPR', 'PATCH leaves unsent fields alone')

  const rows = await auditRows('training', Number(trainingId))
  assert.deepEqual(rows.map(r => r.action), ['create', 'update'])

  const del = await vgCall('deleteTraining', { trainingId }, { token: staff })
  assert.equal(del.status, 204)
  const gone = await vgCall('patchTraining', { trainingId }, { token: staff, body: { name: 'x' } })
  assert.equal(gone.status, 404)
})

test('duplicate training name -> 409', async () => {
  const name = uniq('Dup')
  assert.equal((await vgCall('createTraining', {}, { token: staff, body: { name } })).status, 201)
  assert.equal((await vgCall('createTraining', {}, { token: staff, body: { name } })).status, 409)
})

test('deleting a held training -> 409 naming the count', async () => {
  const created = await vgCall('createTraining', {}, { token: staff, body: { name: uniq('Held') } })
  const trainingId = created.json.trainingId
  const personId = await makeVolunteer('THeld')
  const patch = await vgCall('patchPersonVolunteer', { personId }, {
    token: staff, body: { trainings: [{ trainingId, completedDate: '2026-01-15' }] },
  })
  assert.equal(patch.status, 200)
  const list = await vgCall('getTrainings', {}, { token: staff })
  assert.equal(list.json.find(t => t.trainingId === trainingId).holderCount, 1)
  const del = await vgCall('deleteTraining', { trainingId }, { token: staff })
  assert.equal(del.status, 409)
  assert.match(JSON.stringify(del.json), /1 volunteer/)
})

test('village users and board cannot write the catalog', async () => {
  for (const token of [tokens.users.full_v1, tokens.users.owner_v1, tokens.users.board]) {
    const res = await vgCall('createTraining', {}, { token, body: { name: uniq('Nope') } })
    assert.equal(res.status, 403)
  }
})

test('a grantless user cannot read the catalog', async () => {
  const res = await vgCall('getTrainings', {}, { token: tokens.users.nogrants })
  assert.equal(res.status, 403)
})
