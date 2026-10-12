import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'
import { withDb } from '../../lib/db.js'

// replaceVettings used to drop notes/additionalData on every save, and the
// projection never returned them, so no client could preserve them.
// vetting_type has no static rows and no write endpoint, so this test makes
// one directly.
const staff = tokens.users.staff

test('vetting notes and additionalData survive a save and come back', async () => {
  const vettingTypeId = await withDb(async (c) => {
    const [r] = await c.query('INSERT INTO vetting_type (name) VALUES (?)', [`Background Check ${Date.now()}`])
    return String(r.insertId)
  })
  const p = await vgCall('createPerson', {}, { token: staff, body: { villageId: String(villages.scratch.id), firstName: 'Throwaway', lastName: 'Vet' } })
  const personId = p.json.personId
  const vettings = [{ vettingTypeId, dateEntered: '2026-02-02', dateExpired: null, additionalData: 'ref 42', notes: 'email from Joanne' }]
  const put = await vgCall('putPersonVolunteer', { personId }, { token: staff, body: { active: true, vettings } })
  assert.equal(put.status, 200)
  const v = put.json.volunteer.vettings[0]
  assert.equal(v.notes, 'email from Joanne')
  assert.equal(v.additionalData, 'ref 42')

  const resent = put.json.volunteer.vettings.map(({ vettingTypeId, dateEntered, dateExpired, additionalData, notes }) =>
    ({ vettingTypeId, dateEntered, dateExpired, additionalData, notes }))
  const again = await vgCall('patchPersonVolunteer', { personId }, { token: staff, body: { vettings: resent } })
  assert.equal(again.json.volunteer.vettings[0].notes, 'email from Joanne', 'a load-and-resave keeps notes')
})
