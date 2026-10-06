import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'
import { withDb } from '../../lib/db.js'
import { auditRows } from '../audit/lib.js'

// Positions on the volunteer (spec §4.2–4.3, D8). Throwaways live in the
// scratch village (home); quahog serves as the associate village.
const staff = tokens.users.staff
const scratch = String(villages.scratch.id)
const quahog = String(villages.quahog.id)
const innsmouth = String(villages.innsmouth.id)
const uniq = (s) => `${s} ${Date.now()}-${Math.round(Math.random() * 1e6)}`

async function makeVolunteer (lastName, { villageId = scratch, associateVillageIds = [] } = {}) {
  const body = { firstName: 'Throwaway', lastName, ...(villageId && { villageId }) }
  const p = await vgCall('createPerson', {}, { token: staff, body })
  assert.equal(p.status, 201)
  const put = await vgCall('putPersonVolunteer', { personId: p.json.personId }, { token: staff, body: { active: true, associateVillageIds } })
  assert.equal(put.status, 200)
  return p.json.personId
}
async function makePosition (scope) {
  const r = await vgCall('createPosition', {}, { token: staff, body: { name: uniq(`${scope} pos`), scope } })
  assert.equal(r.status, 201)
  return r.json.positionId
}
async function anyCircleId () {
  const r = await vgCall('getCircles', {}, { token: staff })
  return r.json[0].circleId
}
const patch = (personId, body, token = staff) => vgCall('patchPersonVolunteer', { personId }, { token, body })

test('each scope round-trips with its own shape', async () => {
  const personId = await makeVolunteer('PShape')
  const v = await makePosition('village'); const h = await makePosition('federation'); const c = await makePosition('circle')
  const circleId = await anyCircleId()
  const res = await patch(personId, { positions: [
    { positionId: v, villageId: scratch }, { positionId: h }, { positionId: c, circleId },
  ] })
  assert.equal(res.status, 200)
  const byId = Object.fromEntries(res.json.volunteer.positions.map(p => [p.positionId, p]))
  assert.equal(byId[v].village.villageId, scratch)
  assert.equal(byId[v].circle, null)
  assert.equal(byId[h].village, null)
  assert.equal(byId[h].scope, 'federation')
  assert.equal(byId[c].circle.circleId, circleId)
})

test('scope shape violations and unknown ids -> 422', async () => {
  const personId = await makeVolunteer('PBad')
  const v = await makePosition('village'); const h = await makePosition('federation')
  for (const positions of [
    [{ positionId: v }],                                  // village without villageId
    [{ positionId: h, villageId: scratch }],              // hub with a village
    [{ positionId: '999999' }],                           // unknown position
    [{ positionId: v, villageId: '999999' }],             // unknown village
    [{ positionId: v, villageId: scratch }, { positionId: v, villageId: scratch }], // duplicate
  ]) {
    assert.equal((await patch(personId, { positions })).status, 422, JSON.stringify(positions))
  }
})

test('D8 eligibility: home village, associate village, same-request associate; otherwise 422', async () => {
  const personId = await makeVolunteer('PElig', { associateVillageIds: [quahog] })
  const v = await makePosition('village')
  assert.equal((await patch(personId, { positions: [{ positionId: v, villageId: scratch }] })).status, 200, 'home')
  assert.equal((await patch(personId, { positions: [{ positionId: v, villageId: quahog }] })).status, 200, 'associate')
  assert.equal((await patch(personId, { positions: [{ positionId: v, villageId: innsmouth }] })).status, 422, 'neither')
  const both = await patch(personId, { associateVillageIds: [quahog, innsmouth], positions: [{ positionId: v, villageId: innsmouth }] })
  assert.equal(both.status, 200, 'associate added in the same PATCH')
  const keep = await patch(personId, { associateVillageIds: [quahog], positions: [{ positionId: v, villageId: innsmouth }] })
  assert.equal(keep.status, 422, 'keeping a position while dropping its associate village')
})

test('a Hub volunteer (no home village) can hold a Hub position but not a village one', async () => {
  const personId = await makeVolunteer('PHub', { villageId: null })
  const h = await makePosition('federation'); const v = await makePosition('village')
  assert.equal((await patch(personId, { positions: [{ positionId: h }] })).status, 200)
  assert.equal((await patch(personId, { positions: [{ positionId: h }, { positionId: v, villageId: scratch }] })).status, 422)
})

test('unchanged rows keep their id across a PUT that re-sends them', async () => {
  const personId = await makeVolunteer('PIds')
  const h = await makePosition('federation')
  const first = await patch(personId, { positions: [{ positionId: h }] })
  const id1 = first.json.volunteer.positions[0].volunteerPositionId
  const put = await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { active: true, positions: [{ positionId: h }] } })
  assert.equal(put.json.volunteer.positions[0].volunteerPositionId, id1)
})

test('the volunteer audit diff names added and removed positions', async () => {
  const personId = await makeVolunteer('PAudit')
  const v = await makePosition('village')
  await patch(personId, { positions: [{ positionId: v, villageId: scratch }] })
  await patch(personId, { positions: [] })
  const volunteerId = await withDb(async (c) => (await c.query('SELECT id FROM volunteer WHERE personId = ?', [personId]))[0][0].id)
  const rows = await auditRows('volunteer', volunteerId)
  const [added, removed] = rows.slice(-2).map(r => r.changes.diff.positions)
  assert.match(added.added[0], / — Pawtuxet$/)
  assert.match(removed.removed[0], / — Pawtuxet$/)
})

test('village users are denied (volunteer:write is federation-only today)', async () => {
  const personId = await makeVolunteer('PVillageUser')
  const v = await makePosition('village')
  assert.equal((await patch(personId, { positions: [{ positionId: v, villageId: scratch }] }, tokens.users.full_v1)).status, 403)
})
