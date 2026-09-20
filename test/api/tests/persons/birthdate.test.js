import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { persons, villages } from '../../setup/fixtures.js'

// person:read_birth_date (spec §4.11). Harness roles: only Staff holds it
// (plus Admin's '*'). The column is OMITTED (absent, never null) without it.
const quahog = String(villages.quahog.id)
const pid = persons.quahogMember.id
const bd = persons.quahogMember.birthDate

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
