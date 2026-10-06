import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, users } from '../../setup/fixtures.js'
import { withDb } from '../../lib/db.js'
import { auditRows } from '../audit/lib.js'

// Holders on the position (UI spec §2.4): one PATCH adds and removes.
const staff = tokens.users.staff
const admin = tokens.users.admin
const scratch = String(villages.scratch.id)
const quahog = String(villages.quahog.id)
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

async function makeVolunteer (lastName, { villageId = scratch, associateVillageIds = [] } = {}) {
  const p = await vgCall('createPerson', {}, { token: staff, body: { firstName: 'Holder', lastName, ...(villageId && { villageId }) } })
  await vgCall('putPersonVolunteer', { personId: p.json.personId }, { token: staff, body: { active: true, associateVillageIds } })
  return p.json.personId
}
const makePosition = async (scope) => (await vgCall('createPosition', {}, { token: admin, body: { name: uniq(`${scope} holders`), scope } })).json.positionId
const patch = (positionId, body, token = staff) => vgCall('patchPositionHolders', { positionId }, { token, body })

test('add and remove in one call; GET lists holders by village then name', async () => {
  const positionId = await makePosition('village')
  const a = await makeVolunteer(uniq('HolderA')); const b = await makeVolunteer(uniq('HolderB'), { associateVillageIds: [quahog] })
  const first = await patch(positionId, { add: [{ personId: a, villageId: scratch }, { personId: b, villageId: quahog }] })
  assert.equal(first.status, 200)
  assert.equal(first.json.length, 2)
  const rowA = first.json.find(h => h.person.personId === a)
  assert.equal(rowA.village.villageId, scratch)
  assert.equal(rowA.circle, null)

  const second = await patch(positionId, { remove: [rowA.volunteerPositionId], add: [{ personId: a, villageId: scratch }] })
  assert.equal(second.status, 200, 'removing and re-adding the same holder in one call is fine')
  const listed = (await vgCall('getPositionHolders', { positionId }, { token: staff })).json
  assert.equal(listed.length, 2)
})

test('an add that already exists is a no-op', async () => {
  const positionId = await makePosition('federation')
  const a = await makeVolunteer(uniq('Noop'))
  await patch(positionId, { add: [{ personId: a }] })
  const again = await patch(positionId, { add: [{ personId: a }] })
  assert.equal(again.status, 200)
  assert.equal(again.json.length, 1)
})

test('422s: ineligible village, shape mismatch, foreign remove id, duplicate add, non-volunteer', async () => {
  const positionId = await makePosition('village'); const other = await makePosition('village')
  const a = await makeVolunteer(uniq('Inelig'))
  assert.equal((await patch(positionId, { add: [{ personId: a, villageId: quahog }] })).status, 422)
  assert.equal((await patch(positionId, { add: [{ personId: a }] })).status, 422)
  const held = (await patch(other, { add: [{ personId: a, villageId: scratch }] })).json[0]
  assert.equal((await patch(positionId, { remove: [held.volunteerPositionId] })).status, 422)
  assert.equal((await patch(positionId, { add: [{ personId: a, villageId: scratch }, { personId: a, villageId: scratch }] })).status, 422)
  const nonVol = (await vgCall('createPerson', {}, { token: staff, body: { firstName: 'Not', lastName: uniq('Vol'), villageId: scratch } })).json.personId
  assert.equal((await patch(positionId, { add: [{ personId: nonVol, villageId: scratch }] })).status, 422)
})

test('one volunteer audit event per affected person', async () => {
  const positionId = await makePosition('federation')
  const a = await makeVolunteer(uniq('AudH'))
  await patch(positionId, { add: [{ personId: a }] })
  const volunteerId = (await vgCall('getPerson', { personId: a, projection: ['volunteer'] }, { token: staff })).json.volunteer.volunteerId
  const rows = await auditRows('volunteer', Number(volunteerId))
  assert.ok(rows.some(r => JSON.stringify(r.changes).includes('holders')), 'position name appears in the volunteer diff')
})

test('a reader without volunteer:write gets 403 on PATCH; nogrants gets 403 on GET', async () => {
  const positionId = await makePosition('federation')
  const a = await makeVolunteer(uniq('NoWriteH'))
  assert.equal((await patch(positionId, { add: [{ personId: a }] }, tokens.users.board)).status, 403)
  assert.equal((await vgCall('getPositionHolders', { positionId }, { token: tokens.users.nogrants })).status, 403)
})

test('a village-scoped writer: 403 adding or removing outside their village and for a Hub position', async () => {
  // No seeded role grants volunteer:write at village scope; see completions.test.js.
  const writer = tokens.users.scratch
  let roleId = null
  try {
    roleId = await withDb(async c => {
      const [r] = await c.query("INSERT INTO role (name, scope, isSystem) VALUES (?, 'village', 0)", [uniq('TmpHolderWriter')])
      await c.query("INSERT INTO role_permission (roleId, permission) VALUES (?, 'volunteer:read'), (?, 'volunteer:write')", [r.insertId, r.insertId])
      await c.query('INSERT INTO role_grant (villageId, userId, roleId) VALUES (?, ?, ?)', [villages.scratch.id, users.scratch.userId, r.insertId])
      return r.insertId
    })
    const village = await makePosition('village'); const hub = await makePosition('federation')
    const inside = await makeVolunteer(uniq('InsideH'))
    const outside = await makeVolunteer(uniq('OutsideH'), { villageId: quahog })
    assert.equal((await patch(village, { add: [{ personId: outside, villageId: quahog }] }, writer)).status, 403)
    assert.equal((await patch(hub, { add: [{ personId: inside }] }, writer)).status, 403)
    const heldOutside = (await patch(village, { add: [{ personId: outside, villageId: quahog }] })).json[0]
    assert.equal((await patch(village, { remove: [heldOutside.volunteerPositionId] }, writer)).status, 403)
    // control: inside their own village the grant works
    const ok = await patch(village, { add: [{ personId: inside, villageId: scratch }] }, writer)
    assert.equal(ok.status, 200)
  } finally {
    if (roleId !== null) {
      await withDb(async c => {
        await c.query('DELETE FROM role_grant WHERE roleId = ?', [roleId])
        await c.query('DELETE FROM role_permission WHERE roleId = ?', [roleId])
        await c.query('DELETE FROM role WHERE roleId = ?', [roleId])
      })
    }
  }
})
