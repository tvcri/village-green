import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { auditRows } from '../audit/lib.js'

// /positions: staff-owned catalog with a scope (federation|village|circle).
// Scope is frozen while anyone holds the position (spec §4.1).
const staff = tokens.users.staff
const uniq = (s) => `${s} ${Date.now()}-${Math.round(Math.random() * 1e6)}`

test('staff creates a position with a scope, renames it, changes scope while unheld, deletes it', async () => {
  const name = uniq('Newsletter liaison')
  const created = await vgCall('createPosition', {}, { token: staff, body: { name, scope: 'village' } })
  assert.equal(created.status, 201)
  assert.equal(created.json.scope, 'village')
  assert.equal(created.json.holderCount, 0)
  assert.equal(created.json.description, null)
  const positionId = created.json.positionId

  const moved = await vgCall('patchPosition', { positionId }, { token: staff, body: { scope: 'federation' } })
  assert.equal(moved.status, 200)
  assert.equal(moved.json.scope, 'federation')

  const rows = await auditRows('position', Number(positionId))
  assert.deepEqual(rows.map(r => r.action), ['create', 'update'])

  assert.equal((await vgCall('deletePosition', { positionId }, { token: staff })).status, 204)
})

test('scope is required and must be one of the three', async () => {
  assert.equal((await vgCall('createPosition', {}, { token: staff, body: { name: uniq('NoScope') } })).status, 400)
  assert.equal((await vgCall('createPosition', {}, { token: staff, body: { name: uniq('Hub'), scope: 'hub' } })).status, 400)
})

test('duplicate position name -> 409, even across scopes', async () => {
  const name = uniq('Data Lead')
  assert.equal((await vgCall('createPosition', {}, { token: staff, body: { name, scope: 'village' } })).status, 201)
  assert.equal((await vgCall('createPosition', {}, { token: staff, body: { name, scope: 'federation' } })).status, 409)
})

test('village users cannot write the catalog; staff and village users can read it', async () => {
  const res = await vgCall('createPosition', {}, { token: tokens.users.owner_v1, body: { name: uniq('Nope'), scope: 'village' } })
  assert.equal(res.status, 403)
  assert.equal((await vgCall('getPositions', {}, { token: tokens.users.full_v1 })).status, 200)
})

test('a held position: scope change -> 409, delete -> 409', async () => {
  const created = await vgCall('createPosition', {}, { token: staff, body: { name: uniq('Held'), scope: 'federation' } })
  const positionId = created.json.positionId
  const p = await vgCall('createPerson', {}, { token: staff, body: { villageId: '4', firstName: 'Throwaway', lastName: 'PosHeld' } })
  await vgCall('putPersonVolunteer', { personId: p.json.personId }, { token: staff, body: { active: true, positions: [{ positionId }] } })
  assert.equal((await vgCall('patchPosition', { positionId }, { token: staff, body: { scope: 'village' } })).status, 409)
  assert.equal((await vgCall('patchPosition', { positionId }, { token: staff, body: { name: uniq('Renamed') } })).status, 200, 'rename still works')
  assert.equal((await vgCall('deletePosition', { positionId }, { token: staff })).status, 409)
})
