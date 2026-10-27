import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, persons } from '../../setup/fixtures.js'

// Spec 4.2: a coordinator cannot assign a volunteer to a request dated inside
// that volunteer's pause. Dates sit in 2030 so the requests stay open (the
// nightly auto-complete EVENT rewrites past-dated rows); with "today" in 2026
// the sentence shows years.
const sc = tokens.users.sc
const staff = tokens.users.staff
const quahog = String(villages.quahog.id)
const member = String(persons.quahogMember.id)
const text = (res) => res.json?.message ?? JSON.stringify(res.json)

const createdIds = []
after(async () => {
  for (const serviceRequestId of createdIds) {
    await vgCall('deleteServiceRequest', { serviceRequestId }, { token: sc })
  }
})

async function makeVolunteer (lastName) {
  const created = await vgCall('createPerson', {}, {
    token: staff, body: { villageId: quahog, firstName: 'Pat', lastName },
  })
  assert.equal(created.status, 201, 'precondition: person created')
  const personId = String(created.json.personId)
  const put = await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { status: 'Active' } })
  assert.equal(put.status, 200, 'precondition: volunteer created')
  return personId
}

async function setPause (personId, body) {
  const res = await vgCall('putPersonVolunteerPause', { personId }, { token: staff, body })
  assert.equal(res.status, 200, 'precondition: pause set')
}

const window = { startDate: '2030-03-01', endDate: '2030-03-15', scope: 'window' }
const SENTENCE = /Pat \w+ is paused Mar 1, 2030 – Mar 15, 2030\./

async function create (volunteerPersonId, serviceDate) {
  const res = await vgCall('createServiceRequest', {}, {
    token: sc,
    body: { villageId: quahog, memberPersonId: member, serviceName: 'Errand: Pause test', serviceDate, ...(volunteerPersonId && { volunteerPersonId }) },
  })
  if (res.json?.serviceRequestId) createdIds.push(res.json.serviceRequestId)
  return res
}
const patch = (serviceRequestId, body) => vgCall('patchServiceRequest', { serviceRequestId }, { token: sc, body })

test('create with a paused volunteer on a covered date is 422', async () => {
  for (const scope of ['window', 'all']) {
    const v = await makeVolunteer(`PA${scope}`)
    await setPause(v, { ...window, scope })
    const res = await create(v, '2030-03-10')
    assert.equal(res.status, 422, scope)
    assert.match(text(res), SENTENCE, scope)
  }
})

test('create outside the pause succeeds', async () => {
  const v = await makeVolunteer('PAOutside')
  await setPause(v, window)
  const res = await create(v, '2030-03-16')
  assert.equal(res.status, 201)
  assert.equal(res.json.status, 'Confirmed')
})

test('boundary dates are covered', async () => {
  const v = await makeVolunteer('PABoundary')
  await setPause(v, window)
  assert.equal((await create(v, '2030-03-01')).status, 422)
  assert.equal((await create(v, '2030-03-15')).status, 422)
  assert.equal((await create(v, '2030-03-16')).status, 201)
  assert.equal((await create(v, '2030-02-28')).status, 201)
})

test('no-date pause blocks any date', async () => {
  const v = await makeVolunteer('PANoDate')
  await setPause(v, { startDate: null, endDate: null, scope: 'all' })
  const res = await create(v, '2030-07-04')
  assert.equal(res.status, 422)
  assert.match(text(res), /Pat PANoDate is paused\./)
})

test('expired pause does not block assignment', async () => {
  const v = await makeVolunteer('PAExpired')
  await setPause(v, { startDate: '2020-01-01', endDate: '2020-01-31', scope: 'window' })
  assert.equal((await create(v, '2030-03-10')).status, 201)
})

test('a request without a volunteer is unaffected', async () => {
  assert.equal((await create(null, '2030-03-10')).status, 201)
})

test('patch assigning a paused volunteer is 422', async () => {
  const v = await makeVolunteer('PAPatchAssign')
  await setPause(v, window)
  const { json } = await create(null, '2030-03-10')
  const res = await patch(json.serviceRequestId, { volunteerPersonId: v })
  assert.equal(res.status, 422)
  assert.match(text(res), SENTENCE)
})

test('patch moving the date into the pause is 422', async () => {
  const v = await makeVolunteer('PAPatchDate')
  await setPause(v, window)
  const { json } = await create(v, '2030-04-10')
  const res = await patch(json.serviceRequestId, { serviceDate: '2030-03-05' })
  assert.equal(res.status, 422)
  assert.match(text(res), SENTENCE)
  assert.equal((await patch(json.serviceRequestId, { serviceDate: '2030-04-20' })).status, 200)
})

test('unchanged volunteer and date save despite a pause', async () => {
  const v = await makeVolunteer('PAUnchanged')
  const { json } = await create(v, '2030-03-10')
  await setPause(v, window)
  const res = await patch(json.serviceRequestId, { instructions: 'x', volunteerPersonId: v, serviceDate: '2030-03-10' })
  assert.equal(res.status, 200)
})

test('recording a paused volunteer on a Completed request is allowed', async () => {
  const v = await makeVolunteer('PACompletedPatch')
  await setPause(v, { startDate: null, endDate: null, scope: 'all' })
  const { json } = await create(null, '2030-03-10')
  const res = await patch(json.serviceRequestId, { status: 'Completed', volunteerPersonId: v })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'Completed')
})
