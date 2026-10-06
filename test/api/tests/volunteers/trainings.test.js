import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'
import { withDb } from '../../lib/db.js'
import { auditRows } from '../audit/lib.js'

// Training records on the volunteer (spec D5, §4.2). Full-array replace,
// applied as a diff keyed on (trainingId, completedDate).
const staff = tokens.users.staff
const scratch = String(villages.scratch.id)
const uniq = (s) => `${s} ${Date.now()}-${Math.round(Math.random() * 1e6)}`

async function makeVolunteer (lastName) {
  const p = await vgCall('createPerson', {}, { token: staff, body: { villageId: scratch, firstName: 'Throwaway', lastName } })
  assert.equal(p.status, 201)
  assert.equal((await vgCall('putPersonVolunteer', { personId: p.json.personId }, { token: staff, body: { active: true } })).status, 200)
  return p.json.personId
}
async function makeTraining () {
  const r = await vgCall('createTraining', {}, { token: staff, body: { name: uniq('Training') } })
  assert.equal(r.status, 201)
  return r.json.trainingId
}
const patch = (personId, body) => vgCall('patchPersonVolunteer', { personId }, { token: staff, body })
async function volunteerIdFor (personId) {
  return withDb(async (c) => (await c.query('SELECT id FROM volunteer WHERE personId = ?', [personId]))[0][0].id)
}

test('round-trip: repeat completions, undated record, notes', async () => {
  const personId = await makeVolunteer('TRound')
  const a = await makeTraining()
  const res = await patch(personId, { trainings: [
    { trainingId: a, completedDate: '2025-03-01', notes: 'email from Gabriella' },
    { trainingId: a, completedDate: '2026-03-01' },
    { trainingId: a, completedDate: null },
  ] })
  assert.equal(res.status, 200)
  const t = res.json.volunteer.trainings
  assert.equal(t.length, 3)
  assert.deepEqual(t.map(r => r.completedDate), ['2026-03-01', '2025-03-01', null], 'newest first, undated last')
  assert.equal(t[1].notes, 'email from Gabriella')
  assert.ok(t.every(r => r.volunteerTrainingId && r.name), 'rows carry id and name')
})

test('PATCH without trainings leaves them; notes edit keeps the id; date edit replaces it', async () => {
  const personId = await makeVolunteer('TDiff')
  const a = await makeTraining()
  const first = await patch(personId, { trainings: [{ trainingId: a, completedDate: '2026-01-10' }] })
  const id1 = first.json.volunteer.trainings[0].volunteerTrainingId

  const untouched = await patch(personId, { notes: 'unrelated' })
  assert.equal(untouched.json.volunteer.trainings[0].volunteerTrainingId, id1)

  const noted = await patch(personId, { trainings: [{ trainingId: a, completedDate: '2026-01-10', notes: 'session with Joanne' }] })
  assert.equal(noted.json.volunteer.trainings[0].volunteerTrainingId, id1, 'notes-only edit keeps the row')
  assert.equal(noted.json.volunteer.trainings[0].notes, 'session with Joanne')

  const redated = await patch(personId, { trainings: [{ trainingId: a, completedDate: '2026-02-10', notes: 'session with Joanne' }] })
  assert.notEqual(redated.json.volunteer.trainings[0].volunteerTrainingId, id1, 'date edit is a new record')
})

test('re-sending the projection unchanged writes no audit row', async () => {
  const personId = await makeVolunteer('TNoop')
  const a = await makeTraining()
  const first = await patch(personId, { trainings: [{ trainingId: a, completedDate: '2026-01-10', notes: 'x' }] })
  const volunteerId = await volunteerIdFor(personId)
  const before = (await auditRows('volunteer', volunteerId)).length
  const resend = first.json.volunteer.trainings.map(({ trainingId, completedDate, notes }) => ({ trainingId, completedDate, notes }))
  assert.equal((await patch(personId, { trainings: resend })).status, 200)
  assert.equal((await auditRows('volunteer', volunteerId)).length, before)
})

test('the audit diff names the training and date', async () => {
  const personId = await makeVolunteer('TAudit')
  const a = await makeTraining()
  await patch(personId, { trainings: [{ trainingId: a, completedDate: '2026-04-04' }] })
  const rows = await auditRows('volunteer', await volunteerIdFor(personId))
  assert.match(JSON.stringify(rows.at(-1).changes), /2026-04-04/)
})

test('duplicates and unknown ids -> 422', async () => {
  const personId = await makeVolunteer('TBad')
  const a = await makeTraining()
  assert.equal((await patch(personId, { trainings: [{ trainingId: a, completedDate: '2026-01-01' }, { trainingId: a, completedDate: '2026-01-01' }] })).status, 422)
  assert.equal((await patch(personId, { trainings: [{ trainingId: a }, { trainingId: a, completedDate: null }] })).status, 422, 'two undated')
  assert.equal((await patch(personId, { trainings: [{ trainingId: '999999' }] })).status, 422)
})

test('PUT without trainings clears them; volunteer delete removes them', async () => {
  const personId = await makeVolunteer('TClear')
  const a = await makeTraining()
  await patch(personId, { trainings: [{ trainingId: a }] })
  const put = await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { active: true } })
  assert.deepEqual(put.json.volunteer.trainings, [])
  await patch(personId, { trainings: [{ trainingId: a }] })
  const volunteerId = await volunteerIdFor(personId)
  assert.equal((await vgCall('deletePersonVolunteer', { personId }, { token: staff })).status, 204)
  const left = await withDb(async (c) => (await c.query('SELECT COUNT(*) n FROM volunteer_training WHERE volunteerId = ?', [volunteerId]))[0][0].n)
  assert.equal(left, 0)
})
