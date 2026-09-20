import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { persons, villages } from '../../setup/fixtures.js'
import { withDb } from '../../lib/db.js'

// person:read_birth_date (spec §4.11). Harness roles: only Staff holds it
// (plus Admin's '*'). The column is OMITTED (absent, never null) without it.
const quahog = String(villages.quahog.id)
const pid = persons.quahogMember.id
const bd = persons.quahogMember.birthDate

const E = { elevate: true }
const NOGRANTS = 8

after(async () => {
  await withDb(conn => conn.query('UPDATE person SET birthDate = ? WHERE id = ?', [bd, pid]))
  await withDb(conn => conn.query('DELETE FROM role WHERE roleId > 7'))
})

test('getPerson: staff sees birthDate; board and Village Lead do not', async () => {
  const s = await vgCall('getPerson', { personId: pid }, { token: tokens.users.staff })
  assert.equal(s.status, 200)
  assert.equal(s.json.birthDate, bd)
  for (const who of ['board', 'owner_v1', 'sc']) {
    const r = await vgCall('getPerson', { personId: pid }, { token: tokens.users[who] })
    assert.equal(r.status, 200, who)
    assert.ok(!('birthDate' in r.json), `${who} must not see birthDate`)
  }
})

test('getPersons projection=detail: birthDate only with the key', async () => {
  const s = await vgCall('getPersons', { villageId: [quahog], projection: ['detail'] }, { token: tokens.users.staff })
  assert.equal(s.status, 200)
  const row = s.json.find(p => p.personId === String(pid))
  assert.equal(row.detail.birthDate, bd)
  const b = await vgCall('getPersons', { villageId: [quahog], projection: ['detail'] }, { token: tokens.users.board })
  assert.equal(b.status, 200)
  const brow = b.json.find(p => p.personId === String(pid))
  assert.ok(!('birthDate' in brow.detail), 'board detail omits birthDate')
  const v = await vgCall('getPersons', { villageId: [quahog], projection: ['detail'] }, { token: tokens.users.owner_v1 })
  assert.equal(v.status, 200)
  assert.ok(!('birthDate' in v.json.find(p => p.personId === String(pid)).detail), 'village lead detail omits birthDate')
})

test('getVillagePersons: staff sees birthDate; village lead does not', async () => {
  const s = await vgCall('getVillagePersons', { villageId: quahog }, { token: tokens.users.staff })
  assert.equal(s.status, 200)
  assert.equal(s.json.find(p => p.personId === String(pid)).birthDate, bd)
  const v = await vgCall('getVillagePersons', { villageId: quahog }, { token: tokens.users.owner_v1 })
  assert.equal(v.status, 200)
  assert.ok(!('birthDate' in v.json.find(p => p.personId === String(pid))))
})

test('patchPerson without the key silently ignores birthDate; with the key it clears', async () => {
  // A federation writer WITHOUT person:read_birth_date: made from a new role.
  const created = await vgCall('createRole', E, { token: tokens.users.admin, body: { name: `Writer ${Date.now()}`, scope: 'federation', permissions: ['person:read', 'person:write'] } })
  assert.equal(created.status, 201)
  const roleId = Number(created.json.roleId)
  const grant = await vgCall('createUserGrant', { userId: NOGRANTS, ...E }, { token: tokens.users.admin, body: [{ roleId, villageId: null }] })
  const grantId = grant.json.find(g => String(g.roleId) === String(roleId)).grantId
  try {
    const blind = await vgCall('patchPerson', { personId: pid }, { token: tokens.users.nogrants, body: { birthDate: null, nickname: 'Pete' } })
    assert.equal(blind.status, 200)
    assert.ok(!('birthDate' in blind.json), 'writer still cannot read it')
    const check = await vgCall('getPerson', { personId: pid }, { token: tokens.users.staff })
    assert.equal(check.json.birthDate, bd, 'stored value untouched')
    assert.equal(check.json.nickname, 'Pete', 'other fields saved')

    const widen = await vgCall('updateRole', { roleId, ...E }, { token: tokens.users.admin, body: { permissions: ['person:read', 'person:write', 'person:read_birth_date'] } })
    assert.equal(widen.status, 200)
    const clear = await vgCall('patchPerson', { personId: pid }, { token: tokens.users.nogrants, body: { birthDate: null } })
    assert.equal(clear.status, 200)
    assert.equal(clear.json.birthDate, null, 'now readable and cleared')
  } finally {
    await vgCall('deleteUserGrant', { userId: NOGRANTS, grantId, ...E }, { token: tokens.users.admin })
    await vgCall('patchPerson', { personId: pid }, { token: tokens.users.staff, body: { nickname: null } })
  }
})

test('createPerson without the key drops birthDate from the body', async () => {
  // Service Coordinator holds person:read but no person:write, so use a fresh role again.
  const created = await vgCall('createRole', E, { token: tokens.users.admin, body: { name: `Creator ${Date.now()}`, scope: 'federation', permissions: ['person:read', 'person:write'] } })
  const roleId = Number(created.json.roleId)
  const grant = await vgCall('createUserGrant', { userId: NOGRANTS, ...E }, { token: tokens.users.admin, body: [{ roleId, villageId: null }] })
  const grantId = grant.json.find(g => String(g.roleId) === String(roleId)).grantId
  let newId
  try {
    const res = await vgCall('createPerson', {}, { token: tokens.users.nogrants, body: { villageId: String(villages.scratch.id), firstName: 'No', lastName: 'Birthday', birthDate: '1990-01-01' } })
    assert.equal(res.status, 201)
    newId = res.json.personId
    const check = await vgCall('getPerson', { personId: newId }, { token: tokens.users.staff })
    assert.equal(check.json.birthDate, null, 'birthDate was stripped before insert')
  } finally {
    if (newId) await vgCall('deletePerson', { personId: newId }, { token: tokens.users.staff })
    await vgCall('deleteUserGrant', { userId: NOGRANTS, grantId, ...E }, { token: tokens.users.admin })
  }
})

test('mailing labels birthday-month audience requires the key', async () => {
  const sc = await vgCall('getMailingLabels', { audience: 'birthday-month', role: 'member', month: 3 }, { token: tokens.users.sc })
  assert.equal(sc.status, 403)
  const staff = await vgCall('getMailingLabels', { audience: 'birthday-month', role: 'member', month: 3 }, { token: tokens.users.staff })
  assert.equal(staff.status, 200)
  const roster = await vgCall('getMailingLabels', { audience: 'roster', role: 'member' }, { token: tokens.users.sc })
  assert.equal(roster.status, 200, 'other audiences unchanged')
})
