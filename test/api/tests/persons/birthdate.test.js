import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { persons, villages } from '../../setup/fixtures.js'
import { withDb } from '../../lib/db.js'

// person:read_birth_date. Harness roles: only Staff holds it (plus Admin's
// '*'). The column is OMITTED (absent, never null) without it.
const quahog = String(villages.quahog.id)
const pid = persons.quahogMember.id
const bd = persons.quahogMember.birthDate

const NOGRANTS = 8

// A throwaway federation role with person:read + person:write and NO birth
// date key, granted to the nogrants persona. There is no role-editing API and
// the OAS RoleId schema tops out at the seeded 7, so role, permissions, and
// grant are written directly; effective permissions are read per request, so
// they take effect at once.
const WRITER_ROLE = 90
async function createWriterRole () {
  await withDb(async conn => {
    await conn.query(`INSERT INTO role (roleId, name, scope, description, isSystem) VALUES (?, 'Birthdate Writer', 'federation', 'harness', 0)`, [WRITER_ROLE])
    await conn.query(`INSERT INTO role_permission (roleId, permission) VALUES (?, 'person:read'), (?, 'person:write')`, [WRITER_ROLE, WRITER_ROLE])
    await conn.query('INSERT INTO role_grant (userId, roleId, villageId) VALUES (?, ?, NULL)', [NOGRANTS, WRITER_ROLE])
  })
}
async function grantBirthDateToWriter () {
  await withDb(conn => conn.query(`INSERT INTO role_permission (roleId, permission) VALUES (?, 'person:read_birth_date')`, [WRITER_ROLE]))
}
async function dropWriterRole () {
  await withDb(async conn => {
    await conn.query('DELETE FROM role_grant WHERE roleId = ?', [WRITER_ROLE])
    await conn.query('DELETE FROM role_permission WHERE roleId = ?', [WRITER_ROLE])
    await conn.query('DELETE FROM role WHERE roleId = ?', [WRITER_ROLE])
  })
}

after(async () => {
  await withDb(conn => conn.query('UPDATE person SET birthDate = ? WHERE id = ?', [bd, pid]))
  await dropWriterRole()
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
  // A federation writer WITHOUT person:read_birth_date.
  await createWriterRole()
  try {
    const blind = await vgCall('patchPerson', { personId: pid }, { token: tokens.users.nogrants, body: { birthDate: null, nickname: 'Pete' } })
    assert.equal(blind.status, 200)
    assert.ok(!('birthDate' in blind.json), 'writer still cannot read it')
    const check = await vgCall('getPerson', { personId: pid }, { token: tokens.users.staff })
    assert.equal(check.json.birthDate, bd, 'stored value untouched')
    assert.equal(check.json.nickname, 'Pete', 'other fields saved')

    await grantBirthDateToWriter()
    const clear = await vgCall('patchPerson', { personId: pid }, { token: tokens.users.nogrants, body: { birthDate: null } })
    assert.equal(clear.status, 200)
    assert.equal(clear.json.birthDate, null, 'now readable and cleared')
  } finally {
    await dropWriterRole()
    await vgCall('patchPerson', { personId: pid }, { token: tokens.users.staff, body: { nickname: null } })
  }
})

test('createPerson without the key drops birthDate from the body', async () => {
  // Service Coordinator holds person:read but no person:write, so use the writer role again.
  await createWriterRole()
  let newId
  try {
    const res = await vgCall('createPerson', {}, { token: tokens.users.nogrants, body: { villageId: String(villages.scratch.id), firstName: 'No', lastName: 'Birthday', birthDate: '1990-01-01' } })
    assert.equal(res.status, 201)
    newId = res.json.personId
    const check = await vgCall('getPerson', { personId: newId }, { token: tokens.users.staff })
    assert.equal(check.json.birthDate, null, 'birthDate was stripped before insert')
  } finally {
    if (newId) await vgCall('deletePerson', { personId: newId }, { token: tokens.users.staff })
    await dropWriterRole()
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
