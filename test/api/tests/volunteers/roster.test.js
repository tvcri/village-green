import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// GET /volunteers feeds the Hub name searches (UI spec §2.4): inactive rows
// on request (federation read_inactive only), plus village, displayName,
// active and associateVillages.
const staff = tokens.users.staff
const scratch = String(villages.scratch.id)
const quahog = String(villages.quahog.id)
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

async function makeVolunteer (lastName, { villageId = scratch, active = true, associateVillageIds = [] } = {}) {
  const p = await vgCall('createPerson', {}, { token: staff, body: { firstName: 'Roster', lastName, ...(villageId && { villageId }) } })
  assert.equal(p.status, 201)
  assert.equal((await vgCall('putPersonVolunteer', { personId: p.json.personId }, { token: staff, body: { active, associateVillageIds } })).status, 200)
  return p.json.personId
}

test('default roster is active-only; includeInactive adds inactive rows with the new fields', async () => {
  const activeId = await makeVolunteer(uniq('RosterActive'), { associateVillageIds: [quahog] })
  const inactiveId = await makeVolunteer(uniq('RosterInactive'), { active: false })

  const def = await vgCall('getVolunteers', {}, { token: staff })
  assert.equal(def.status, 200)
  assert.ok(def.json.some(v => v.personId === activeId))
  assert.ok(!def.json.some(v => v.personId === inactiveId), 'inactive excluded by default')

  const all = await vgCall('getVolunteers', { includeInactive: true }, { token: staff })
  const a = all.json.find(v => v.personId === activeId)
  const i = all.json.find(v => v.personId === inactiveId)
  assert.ok(i, 'inactive included on request')
  assert.equal(i.active, false)
  assert.equal(a.active, true)
  assert.equal(a.village.villageId, scratch)
  assert.match(a.displayName, /^Roster /)
  assert.deepEqual(a.associateVillages.map(v => v.villageId), [quahog])
})

test('a Hub volunteer has village null', async () => {
  const id = await makeVolunteer(uniq('RosterHub'), { villageId: null })
  const row = (await vgCall('getVolunteers', { includeInactive: true }, { token: staff })).json.find(v => v.personId === id)
  assert.equal(row.village, null)
})

test('includeInactive is ignored without volunteer:read_inactive (board)', async () => {
  const inactiveId = await makeVolunteer(uniq('RosterBoardInactive'), { active: false })
  const res = await vgCall('getVolunteers', { includeInactive: true }, { token: tokens.users.board })
  assert.equal(res.status, 200)
  assert.ok(res.json.length > 0)
  assert.ok(res.json.every(v => v.active === true), 'only active rows')
  assert.ok(!res.json.some(v => v.personId === inactiveId), 'inactive volunteer not returned')
})

test('callers without volunteer:read get 403', async () => {
  assert.equal((await vgCall('getVolunteers', {}, { token: tokens.users.nogrants })).status, 403)
})
