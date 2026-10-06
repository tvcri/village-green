import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'
import { withDb } from '../../lib/db.js'
import { auditRows } from '../audit/lib.js'

// D8 is an invariant: a home-village or associate change revokes village
// positions that no longer qualify, and the revocation lands in the
// VOLUNTEER audit trail (spec §4.3 "Revocation").
const staff = tokens.users.staff
const scratch = String(villages.scratch.id)
const quahog = String(villages.quahog.id)
const innsmouth = String(villages.innsmouth.id)
const uniq = (s) => `${s} ${Date.now()}-${Math.round(Math.random() * 1e6)}`

async function setup (lastName) {
  const p = await vgCall('createPerson', {}, { token: staff, body: { villageId: scratch, firstName: 'Throwaway', lastName } })
  const personId = p.json.personId
  const mk = async (scope) => (await vgCall('createPosition', {}, { token: staff, body: { name: uniq(scope), scope } })).json.positionId
  const atHome = await mk('village'); const atAssoc = await mk('village'); const hub = await mk('federation')
  const put = await vgCall('putPersonVolunteer', { personId }, { token: staff, body: {
    active: true, associateVillageIds: [quahog],
    positions: [{ positionId: atHome, villageId: scratch }, { positionId: atAssoc, villageId: quahog }, { positionId: hub }],
  } })
  assert.equal(put.status, 200)
  const volunteerId = await withDb(async (c) => (await c.query('SELECT id FROM volunteer WHERE personId = ?', [personId]))[0][0].id)
  return { personId, volunteerId, atHome, atAssoc, hub }
}
const heldIds = async (personId) => {
  const r = await vgCall('getPerson', { personId, projection: ['volunteer'] }, { token: staff })
  return r.json.volunteer.positions.map(p => p.positionId).sort()
}

test('moving the home village revokes the home-village position, keeps associate and Hub ones, audits it', async () => {
  const s = await setup('RMove')
  const before = (await auditRows('volunteer', s.volunteerId)).length
  const res = await vgCall('patchPerson', { personId: s.personId }, { token: staff, body: { villageId: innsmouth } })
  assert.equal(res.status, 200)
  assert.deepEqual(await heldIds(s.personId), [s.atAssoc, s.hub].sort())
  const rows = await auditRows('volunteer', s.volunteerId)
  assert.equal(rows.length, before + 1, 'one volunteer audit row for the revocation')
  assert.equal(rows.at(-1).changes.diff.positions.removed.length, 1)
})

test('clearing the home village (becoming a Hub volunteer) keeps Hub and associate-backed positions', async () => {
  const s = await setup('RClear')
  assert.equal((await vgCall('patchPerson', { personId: s.personId }, { token: staff, body: { villageId: null } })).status, 200)
  assert.deepEqual(await heldIds(s.personId), [s.atAssoc, s.hub].sort())
})

test('a volunteer PATCH removing an associate village, without positions, revokes what it covered', async () => {
  const s = await setup('RAssoc')
  const res = await vgCall('patchPersonVolunteer', { personId: s.personId }, { token: staff, body: { associateVillageIds: [] } })
  assert.equal(res.status, 200)
  assert.deepEqual(res.json.volunteer.positions.map(p => p.positionId).sort(), [s.atHome, s.hub].sort())
})

test('a person PATCH that does not touch villageId revokes nothing and writes no volunteer audit row', async () => {
  const s = await setup('RNoop')
  const before = (await auditRows('volunteer', s.volunteerId)).length
  await vgCall('patchPerson', { personId: s.personId }, { token: staff, body: { phone: '401-555-0100' } })
  assert.equal((await heldIds(s.personId)).length, 3)
  assert.equal((await auditRows('volunteer', s.volunteerId)).length, before)
})
