import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { persons, villages } from '../../setup/fixtures.js'
import { withDb } from '../../lib/db.js'

// person:read_demographics gates gender, ethnicity, races and isVeteran (Chris
// Daley's T3). Harness roles: only Staff holds it (plus Admin's '*'). Every
// gated field is OMITTED (absent, never null) without it, on every read path,
// and silently dropped from a write body. Pronouns are T1 and NOT gated — the
// board test below asserts they are visible. Mirrors birthdate.test.js.
const GATED = ['gender', 'ethnicity', 'races', 'isVeteran']
const quahog = String(villages.quahog.id)
const pid = persons.quahogMember.id

const NOGRANTS = 8
const WRITER_ROLE = 91   // birthdate.test.js uses 90; distinct so the suites can share a DB

async function createWriterRole () {
  await withDb(async conn => {
    await conn.query(`INSERT INTO role (roleId, name, scope, description, isSystem) VALUES (?, 'Demographics Writer', 'federation', 'harness', 0)`, [WRITER_ROLE])
    await conn.query(`INSERT INTO role_permission (roleId, permission) VALUES (?, 'person:read'), (?, 'person:write')`, [WRITER_ROLE, WRITER_ROLE])
    await conn.query('INSERT INTO role_grant (userId, roleId, villageId) VALUES (?, ?, NULL)', [NOGRANTS, WRITER_ROLE])
  })
}
async function grantDemographicsToWriter () {
  await withDb(conn => conn.query(`INSERT INTO role_permission (roleId, permission) VALUES (?, 'person:read_demographics')`, [WRITER_ROLE]))
}
async function dropWriterRole () {
  await withDb(async conn => {
    await conn.query('DELETE FROM role_grant WHERE roleId = ?', [WRITER_ROLE])
    await conn.query('DELETE FROM role_permission WHERE roleId = ?', [WRITER_ROLE])
    await conn.query('DELETE FROM role WHERE roleId = ?', [WRITER_ROLE])
  })
}
async function resetDemographics () {
  await withDb(async conn => {
    await conn.query('DELETE FROM person_race WHERE personId = ?', [pid])
    await conn.query('UPDATE person SET genderId = NULL, ethnicityId = NULL, pronouns = NULL, isVeteran = NULL WHERE id = ?', [pid])
  })
}

after(async () => {
  await resetDemographics()
  await dropWriterRole()
})

async function lookups () {
  const g = await vgCall('getGenders', {}, { token: tokens.users.staff })
  const r = await vgCall('getRaces', {}, { token: tokens.users.staff })
  return {
    female: g.json.find(x => x.name === 'Female').genderId,
    asian: r.json.find(x => x.name === 'Asian').raceId,
    white: r.json.find(x => x.name === 'White').raceId,
  }
}

test('staff sets demographics and pronouns and reads them back with names', async () => {
  const { female, asian, white } = await lookups()
  const res = await vgCall('patchPerson', { personId: pid }, {
    token: tokens.users.staff,
    body: { genderId: female, races: [asian, white], pronouns: 'he/him', isVeteran: true },
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.gender.name, 'Female')
  assert.equal(res.json.ethnicity, null, 'unset single-valued lookup reads as null')
  assert.deepEqual(res.json.races.map(x => x.name), ['Asian', 'White'])
  assert.equal(res.json.pronouns, 'he/him')
  assert.strictEqual(res.json.isVeteran, true, 'BIT(1) reads as a JS boolean, not 1')
})

test('getPerson: board, Village Lead and SC see pronouns but none of the gated fields', async () => {
  for (const who of ['board', 'owner_v1', 'sc']) {
    const r = await vgCall('getPerson', { personId: pid }, { token: tokens.users[who] })
    assert.equal(r.status, 200, who)
    assert.equal(r.json.pronouns, 'he/him', `${who} sees pronouns (T1, ungated)`)
    for (const f of GATED) assert.ok(!(f in r.json), `${who} must not see ${f}`)
  }
})

test('getPersons projection=detail: gated fields only with the key; isVeteran is a JSON boolean', async () => {
  const s = await vgCall('getPersons', { villageId: [quahog], projection: ['detail'] }, { token: tokens.users.staff })
  assert.equal(s.status, 200)
  const row = s.json.find(p => p.personId === String(pid))
  assert.equal(row.detail.gender.name, 'Female')
  assert.strictEqual(row.detail.isVeteran, true, 'detail.isVeteran must be boolean true, not 1')
  assert.deepEqual(row.detail.races.map(x => x.name), ['Asian', 'White'])
  const b = await vgCall('getPersons', { villageId: [quahog], projection: ['detail'] }, { token: tokens.users.board })
  const brow = b.json.find(p => p.personId === String(pid))
  assert.equal(brow.detail.pronouns, 'he/him', 'board detail carries pronouns')
  for (const f of GATED) assert.ok(!(f in brow.detail), `board detail must not carry ${f}`)
})

test('getVillagePersons: staff sees gated fields; village lead does not', async () => {
  const s = await vgCall('getVillagePersons', { villageId: quahog }, { token: tokens.users.staff })
  assert.equal(s.status, 200)
  assert.equal(s.json.find(p => p.personId === String(pid)).gender.name, 'Female')
  const v = await vgCall('getVillagePersons', { villageId: quahog }, { token: tokens.users.owner_v1 })
  assert.equal(v.status, 200)
  const vrow = v.json.find(p => p.personId === String(pid))
  assert.equal(vrow.pronouns, 'he/him')
  for (const f of GATED) assert.ok(!(f in vrow), `village lead must not see ${f}`)
})

test('patchPerson without the key silently drops the gated fields but saves pronouns', async () => {
  await createWriterRole()
  try {
    const blind = await vgCall('patchPerson', { personId: pid }, {
      token: tokens.users.nogrants,
      body: { genderId: null, races: [], isVeteran: null, pronouns: 'they/them', nickname: 'Pete' },
    })
    assert.equal(blind.status, 200)
    for (const f of GATED) assert.ok(!(f in blind.json), `writer still cannot read ${f}`)
    assert.equal(blind.json.pronouns, 'they/them', 'pronouns are writable without the key')
    const check = await vgCall('getPerson', { personId: pid }, { token: tokens.users.staff })
    assert.equal(check.json.gender.name, 'Female', 'stored gender untouched')
    assert.equal(check.json.races.length, 2, 'stored races untouched')
    assert.strictEqual(check.json.isVeteran, true, 'stored isVeteran untouched')
    assert.equal(check.json.nickname, 'Pete', 'other fields saved')

    await grantDemographicsToWriter()
    const clear = await vgCall('patchPerson', { personId: pid }, {
      token: tokens.users.nogrants,
      body: { genderId: null, races: [], isVeteran: false },
    })
    assert.equal(clear.status, 200)
    assert.equal(clear.json.gender, null)
    assert.deepEqual(clear.json.races, [])
    assert.strictEqual(clear.json.isVeteran, false)
  } finally {
    await dropWriterRole()
    await vgCall('patchPerson', { personId: pid }, { token: tokens.users.staff, body: { nickname: null, pronouns: null } })
  }
})

test('createPerson without the key drops the gated fields from the body', async () => {
  await createWriterRole()
  let newId
  try {
    const { asian } = await lookups()
    const res = await vgCall('createPerson', {}, {
      token: tokens.users.nogrants,
      body: { villageId: String(villages.scratch.id), firstName: 'No', lastName: 'Demographics', isVeteran: true, races: [asian] },
    })
    assert.equal(res.status, 201)
    newId = res.json.personId
    const check = await vgCall('getPerson', { personId: newId }, { token: tokens.users.staff })
    assert.equal(check.json.isVeteran, null, 'isVeteran stripped before insert')
    assert.deepEqual(check.json.races, [], 'races stripped before insert')
  } finally {
    if (newId) await vgCall('deletePerson', { personId: newId }, { token: tokens.users.staff })
    await dropWriterRole()
  }
})

test('unknown raceId is rejected by the FK, not silently ignored', async () => {
  const res = await vgCall('patchPerson', { personId: pid }, { token: tokens.users.staff, body: { races: ['999999'] } })
  assert.ok(res.status >= 400, `expected an error status, got ${res.status}`)
})
