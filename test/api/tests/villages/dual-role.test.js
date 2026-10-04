import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'
import { villages, persons } from '../../setup/fixtures.js'

// Dual-role flags on the village rosters: each Member row carries
// isAlsoVolunteer and each Volunteer row isAlsoMember, so a village can list
// the people behind its personCounts.both figure. The flagged rows must equal
// that figure exactly — same active views, same person.villageId scoping.

const quahog = villages.quahog.id
const NOGRANTS = 8

// No canonical fixture holds both roles, so Peter Griffin (Quahog member)
// gets a temporary active volunteer row. Files run with concurrency 1, and
// after() removes it.
const DUAL_VOLUNTEER = 90

// Throwaway village roles holding one roster read each, granted to the
// nogrants persona in turn. Effective permissions are read per request.
const MEMBER_ONLY_ROLE = 91
const VOLUNTEER_ONLY_ROLE = 92
async function grantOnly (roleId, permission) {
  await withDb(async conn => {
    await conn.query('DELETE FROM role_grant WHERE userId = ?', [NOGRANTS])
    await conn.query(`INSERT INTO role (roleId, name, scope, description, isSystem) VALUES (?, ?, 'village', 'harness', 0)`,
      [roleId, `Only ${permission}`])
    await conn.query('INSERT INTO role_permission (roleId, permission) VALUES (?, ?)', [roleId, permission])
    await conn.query('INSERT INTO role_grant (userId, roleId, villageId) VALUES (?, ?, ?)', [NOGRANTS, roleId, quahog])
  })
}
async function dropRoles () {
  await withDb(async conn => {
    for (const roleId of [MEMBER_ONLY_ROLE, VOLUNTEER_ONLY_ROLE]) {
      await conn.query('DELETE FROM role_grant WHERE roleId = ?', [roleId])
      await conn.query('DELETE FROM role_permission WHERE roleId = ?', [roleId])
      await conn.query('DELETE FROM role WHERE roleId = ?', [roleId])
    }
  })
}

before(async () => {
  await withDb(conn => conn.query('INSERT INTO volunteer (id, personId, active) VALUES (?, ?, 1)',
    [DUAL_VOLUNTEER, persons.quahogMember.id]))
})

after(async () => {
  await dropRoles()
  await withDb(conn => conn.query('DELETE FROM volunteer WHERE id = ?', [DUAL_VOLUNTEER]))
})

async function bothCount () {
  const { status, json } = await vgCall('getVillage',
    { villageId: quahog, projection: ['personCounts'] }, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  return json.personCounts.both
}

test('members: isAlsoVolunteer flags exactly the personCounts.both people', async () => {
  const { status, json } = await vgCall('getVillageMembers', { villageId: quahog }, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.ok(json.every(m => typeof m.isAlsoVolunteer === 'boolean'), 'every row carries a boolean')
  const flagged = json.filter(m => m.isAlsoVolunteer).map(m => m.personId)
  assert.deepEqual(flagged, [String(persons.quahogMember.id)])
  assert.equal(flagged.length, await bothCount())
})

test('volunteers: isAlsoMember flags exactly the personCounts.both people', async () => {
  const { status, json } = await vgCall('getVillageVolunteers', { villageId: quahog }, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.ok(json.every(v => typeof v.isAlsoMember === 'boolean'), 'every row carries a boolean')
  const flagged = json.filter(v => v.isAlsoMember).map(v => v.personId)
  assert.deepEqual(flagged, [String(persons.quahogMember.id)])
  assert.equal(flagged.length, await bothCount())
})

test('members: isAlsoVolunteer is omitted without volunteer:read', async () => {
  await dropRoles()
  await grantOnly(MEMBER_ONLY_ROLE, 'member:read')
  const { status, json } = await vgCall('getVillageMembers', { villageId: quahog }, { token: tokens.users.nogrants })
  assert.equal(status, 200)
  assert.ok(json.length, 'roster is non-empty')
  assert.ok(json.every(m => !('isAlsoVolunteer' in m)), 'flag withheld')
})

test('volunteers: isAlsoMember is omitted without member:read', async () => {
  await dropRoles()
  await grantOnly(VOLUNTEER_ONLY_ROLE, 'volunteer:read')
  const { status, json } = await vgCall('getVillageVolunteers', { villageId: quahog }, { token: tokens.users.nogrants })
  assert.equal(status, 200)
  assert.ok(json.length, 'roster is non-empty')
  assert.ok(json.every(v => !('isAlsoMember' in v)), 'flag withheld')
})
