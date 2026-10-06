import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'
import { auditRows } from '../audit/lib.js'

// Batch completions on the training (UI spec §2.4).
const staff = tokens.users.staff
const admin = tokens.users.admin
const scratch = String(villages.scratch.id)
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

async function makeVolunteer (lastName, { villageId = scratch } = {}) {
  const p = await vgCall('createPerson', {}, { token: staff, body: { firstName: 'Batch', lastName, ...(villageId && { villageId }) } })
  await vgCall('putPersonVolunteer', { personId: p.json.personId }, { token: staff, body: { active: true } })
  return p.json.personId
}
const makeTraining = async () => (await vgCall('createTraining', {}, { token: admin, body: { name: uniq('Session') } })).json.trainingId
const makePosition = async (scope) => (await vgCall('createPosition', {}, { token: admin, body: { name: uniq(`${scope} batch pos`), scope } })).json.positionId
const record = (trainingId, body, token = staff) => vgCall('recordTrainingCompletions', { trainingId }, { token, body })
async function volunteerIdOf (personId) {
  return (await vgCall('getPerson', { personId, projection: ['volunteer'] }, { token: staff })).json.volunteer.volunteerId
}

test('records one completion per person, newest first in the list, with notes on each', async () => {
  const trainingId = await makeTraining()
  const a = await makeVolunteer(uniq('BatchA')); const b = await makeVolunteer(uniq('BatchB'))
  const res = await record(trainingId, { completedDate: '2026-10-04', notes: 'email from Gabriella', personIds: [a, b] })
  assert.equal(res.status, 200)
  assert.deepEqual([...res.json.recorded].sort(), [a, b].sort())
  assert.deepEqual(res.json.skipped, [])
  await record(trainingId, { completedDate: '2025-04-25', personIds: [a] })

  const list = (await vgCall('getTrainingCompletions', { trainingId }, { token: staff })).json
  assert.equal(list.length, 3)
  assert.equal(list[0].completedDate, '2026-10-04')
  assert.equal(list[2].completedDate, '2025-04-25')
  assert.equal(list[0].notes, 'email from Gabriella')
  const rowA = list.find(r => r.person.personId === a && r.completedDate === '2026-10-04')
  assert.equal(rowA.person.village.villageId, scratch)
  assert.match(rowA.person.displayName, /^Batch /)
})

test('re-posting the same batch skips everyone', async () => {
  const trainingId = await makeTraining()
  const a = await makeVolunteer(uniq('Again'))
  await record(trainingId, { completedDate: '2026-10-04', personIds: [a] })
  const again = await record(trainingId, { completedDate: '2026-10-04', personIds: [a] })
  assert.equal(again.status, 200)
  assert.deepEqual(again.json.recorded, [])
  assert.deepEqual(again.json.skipped, [a])
  assert.equal((await vgCall('getTrainingCompletions', { trainingId }, { token: staff })).json.length, 1)
})

test('village position: assigned at the home village; noHomeVillage and alreadyHolds still record the completion', async () => {
  const trainingId = await makeTraining(); const positionId = await makePosition('village')
  const homed = await makeVolunteer(uniq('Homed'))
  const hub = await makeVolunteer(uniq('HubVol'), { villageId: null })
  const holder = await makeVolunteer(uniq('Holder'))
  await vgCall('patchPersonVolunteer', { personId: holder }, { token: staff, body: { positions: [{ positionId, villageId: scratch }] } })

  const res = await record(trainingId, { completedDate: '2026-10-05', personIds: [homed, hub, holder], positionId })
  assert.equal(res.status, 200)
  assert.equal(res.json.recorded.length, 3)
  assert.deepEqual(res.json.assigned, [homed])
  assert.deepEqual(res.json.notAssigned.sort((x, y) => x.reason.localeCompare(y.reason)),
    [{ personId: holder, reason: 'alreadyHolds' }, { personId: hub, reason: 'noHomeVillage' }])
  const p = (await vgCall('getPerson', { personId: homed, projection: ['volunteer'] }, { token: staff })).json
  assert.equal(p.volunteer.positions[0].village.villageId, scratch)
})

test('Hub position: everyone not already holding it is assigned, including a Hub volunteer', async () => {
  const trainingId = await makeTraining(); const positionId = await makePosition('federation')
  const hub = await makeVolunteer(uniq('HubOnly'), { villageId: null })
  const res = await record(trainingId, { completedDate: '2026-10-05', personIds: [hub], positionId })
  assert.deepEqual(res.json.assigned, [hub])
})

test('one volunteer audit event per affected person', async () => {
  const trainingId = await makeTraining()
  const a = await makeVolunteer(uniq('AudA')); const b = await makeVolunteer(uniq('AudB'))
  await record(trainingId, { completedDate: '2026-10-03', personIds: [a, b] })
  for (const personId of [a, b]) {
    const rows = await auditRows('volunteer', Number(await volunteerIdOf(personId)))
    assert.ok(rows.some(r => JSON.stringify(r.changes).includes('2026-10-03')), `audit for ${personId}`)
  }
})

test('422s: circle position, a non-volunteer, duplicate personIds; 400 without a date; 404 unknown training', async () => {
  const trainingId = await makeTraining()
  const a = await makeVolunteer(uniq('Bad'))
  const circlePos = await makePosition('circle')
  assert.equal((await record(trainingId, { completedDate: '2026-10-01', personIds: [a], positionId: circlePos })).status, 422)
  const nonVol = (await vgCall('createPerson', {}, { token: staff, body: { firstName: 'Not', lastName: uniq('Volunteer'), villageId: scratch } })).json.personId
  const nv = await record(trainingId, { completedDate: '2026-10-01', personIds: [a, nonVol] })
  assert.equal(nv.status, 422)
  assert.equal((await vgCall('getTrainingCompletions', { trainingId }, { token: staff })).json.length, 0, 'all or nothing')
  assert.equal((await record(trainingId, { completedDate: '2026-10-01', personIds: [a, a] })).status, 422)
  assert.equal((await record(trainingId, { personIds: [a] })).status, 400)
  assert.equal((await record('999999', { completedDate: '2026-10-01', personIds: [a] })).status, 404)
})

test('callers without volunteer:write get 403 and nothing is written', async () => {
  const trainingId = await makeTraining()
  const a = await makeVolunteer(uniq('NoWrite'))
  assert.equal((await record(trainingId, { completedDate: '2026-10-01', personIds: [a] }, tokens.users.board)).status, 403)
  assert.equal((await vgCall('getTrainingCompletions', { trainingId }, { token: staff })).json.length, 0)
})

test('DELETE removes one record (audited); a record of another training is 404', async () => {
  const t1 = await makeTraining(); const t2 = await makeTraining()
  const a = await makeVolunteer(uniq('Del'))
  await record(t1, { completedDate: '2026-09-01', personIds: [a] })
  const row = (await vgCall('getTrainingCompletions', { trainingId: t1 }, { token: staff })).json[0]
  assert.equal((await vgCall('deleteTrainingCompletion', { trainingId: t2, volunteerTrainingId: row.volunteerTrainingId }, { token: staff })).status, 404)
  assert.equal((await vgCall('deleteTrainingCompletion', { trainingId: t1, volunteerTrainingId: row.volunteerTrainingId }, { token: staff })).status, 204)
  assert.equal((await vgCall('getTrainingCompletions', { trainingId: t1 }, { token: staff })).json.length, 0)
  const rows = await auditRows('volunteer', Number(await volunteerIdOf(a)))
  assert.ok(rows.length >= 2, 'record and removal both audited')
})
