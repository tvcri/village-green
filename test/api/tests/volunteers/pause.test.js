import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { makeVolunteerDropReason } from '../../lib/dropReason.js'
import { villages } from '../../setup/fixtures.js'

// A volunteer pause is one rule per Active volunteer: { startDate, endDate,
// scope }. Throwaway persons live in the scratch village.
const scratch = String(villages.scratch.id)
const staff = tokens.users.staff
const text = (res) => res.json?.message ?? JSON.stringify(res.json)

async function makeVolunteer (lastName, status = 'Active') {
  const created = await vgCall('createPerson', {}, {
    token: staff, body: { villageId: scratch, firstName: 'Pat', lastName },
  })
  assert.equal(created.status, 201, 'precondition: person created')
  const personId = created.json.personId
  const put = await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { status } })
  assert.equal(put.status, 200, 'precondition: volunteer created')
  return personId
}

const pause = (personId, body, token = staff) => vgCall('putPersonVolunteerPause', { personId }, { token, body })
const unpause = (personId, token = staff) => vgCall('deletePersonVolunteerPause', { personId }, { token })
const pauseOf = async (personId) => (await vgCall('getPerson', { personId, projection: ['volunteer'] }, { token: staff })).json.volunteer.pause

test('PUT creates and replaces a pause', async () => {
  const personId = await makeVolunteer('PCreate')
  const first = { startDate: '2027-03-01', endDate: '2027-03-15', scope: 'window' }
  const res = await pause(personId, first)
  assert.equal(res.status, 200)
  assert.deepEqual(res.json, first)
  assert.deepEqual(await pauseOf(personId), first)
  const second = { startDate: null, endDate: null, scope: 'all' }
  assert.deepEqual((await pause(personId, second)).json, second)
  assert.deepEqual(await pauseOf(personId), second)
})

test('DELETE unpauses and is idempotent', async () => {
  const personId = await makeVolunteer('PDelete')
  await pause(personId, { startDate: null, endDate: null, scope: 'all' })
  assert.equal((await unpause(personId)).status, 204)
  assert.equal(await pauseOf(personId), null)
  assert.equal((await unpause(personId)).status, 204)
})

test('pause on a person with no volunteer row is 404', async () => {
  const created = await vgCall('createPerson', {}, { token: staff, body: { villageId: scratch, firstName: 'Pat', lastName: 'PNone' } })
  const personId = created.json.personId
  assert.equal((await pause(personId, { startDate: null, endDate: null, scope: 'all' })).status, 404)
  assert.equal((await unpause(personId)).status, 404)
})

test('only an Active volunteer can be paused', async () => {
  const personId = await makeVolunteer('PPending', 'Pending')
  const res = await pause(personId, { startDate: null, endDate: null, scope: 'all' })
  assert.equal(res.status, 422)
  assert.match(text(res), /Active volunteer/)
})

test('window without both dates is 422; start after end is 422', async () => {
  const personId = await makeVolunteer('PRules')
  for (const [startDate, endDate] of [['2027-03-01', null], [null, '2027-03-15'], [null, null]]) {
    const res = await pause(personId, { startDate, endDate, scope: 'window' })
    assert.equal(res.status, 422)
    assert.match(text(res), /A date-window pause needs a start and an end date\./)
  }
  for (const scope of ['all', 'window']) {
    const res = await pause(personId, { startDate: '2027-03-15', endDate: '2027-03-01', scope })
    assert.equal(res.status, 422)
    assert.match(text(res), /The start date must be on or before the end date\./)
  }
  assert.equal(await pauseOf(personId), null, 'rejected requests store nothing')
})

test('scope outside the vocabulary is 400', async () => {
  const personId = await makeVolunteer('PScope')
  const res = await pause(personId, { startDate: null, endDate: null, scope: 'forever' })
  assert.equal(res.status, 400)
})

test('pause shows on volunteer lists', async () => {
  const pausedId = await makeVolunteer('PListOn')
  const freeId = await makeVolunteer('PListOff')
  const body = { startDate: '2027-03-01', endDate: null, scope: 'all' }
  await pause(pausedId, body)

  const all = (await vgCall('getVolunteers', {}, { token: staff })).json
  assert.deepEqual(all.find(v => v.personId === pausedId).pause, body)
  assert.equal(all.find(v => v.personId === freeId).pause, null)

  const village = (await vgCall('getVillageVolunteers', { villageId: scratch }, { token: staff })).json
  const row = village.find(v => v.personId === pausedId)
  assert.deepEqual(row.pause, body)
  assert.equal(row.displayName, 'Pat PListOn')
  assert.equal(village.find(v => v.personId === freeId).pause, null)
})

test('leaving Active deletes the pause (PATCH and PUT); reactivating does not restore it', async () => {
  const body = { startDate: null, endDate: null, scope: 'all' }
  const patchId = await makeVolunteer('PLeavePatch')
  await pause(patchId, body)
  const dropped = await vgCall('patchPersonVolunteer', { personId: patchId }, {
    token: staff, body: { status: 'Dropped', dropReasonId: await makeVolunteerDropReason() },
  })
  assert.equal(dropped.status, 200)
  assert.equal(dropped.json.volunteer.pause, null)
  const back = await vgCall('patchPersonVolunteer', { personId: patchId }, { token: staff, body: { status: 'Active' } })
  assert.equal(back.json.volunteer.pause, null, 'reactivating does not resurrect the pause')

  const putId = await makeVolunteer('PLeavePut')
  await pause(putId, body)
  const put = await vgCall('putPersonVolunteer', { personId: putId }, { token: staff, body: { status: 'Pending' } })
  assert.equal(put.status, 200)
  assert.equal(put.json.volunteer.pause, null)
  const again = await vgCall('putPersonVolunteer', { personId: putId }, { token: staff, body: { status: 'Active' } })
  assert.equal(again.json.volunteer.pause, null)
})

test('PUT of the volunteer leaves the pause alone', async () => {
  const personId = await makeVolunteer('PKeep')
  const body = { startDate: '2027-03-01', endDate: '2027-03-15', scope: 'window' }
  await pause(personId, body)
  const put = await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { status: 'Active', notes: 'x' } })
  assert.equal(put.status, 200)
  assert.deepEqual(put.json.volunteer.pause, body)
})

test('pause gates: no vg:volunteer scope -> 403; no volunteer:write in the village -> 403', async () => {
  const personId = await makeVolunteer('PGate')
  const body = { startDate: null, endDate: null, scope: 'all' }
  for (const token of [tokens.special.readOnly, tokens.users.full_v1]) {
    assert.equal((await pause(personId, body, token)).status, 403)
    assert.equal((await unpause(personId, token)).status, 403)
  }
  assert.equal(await pauseOf(personId), null)
})
