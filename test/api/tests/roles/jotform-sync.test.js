import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'
import { persons } from '../../setup/fixtures.js'

// Role 10, JotForm Sync (migration 0037): the vg-sync JotForm service account.
// It reads persons, with inactive members and volunteers (reports name former
// members), and writes Friendly Calls & Visits reports through fcv_sync:*.
// member:read and volunteer:read are there because a person is hidden from a
// caller who cannot read any of the person's associations.
const jfToken = tokens.users.jotform

test('role 10 exists with exactly eight permissions', async () => {
  const [[role]] = await withDb(c => c.query('SELECT * FROM role WHERE roleId = 10'))
  assert.ok(role, 'role 10 exists')
  assert.equal(role.name, 'JotForm Sync')
  assert.equal(role.scope, 'federation')
  assert.equal(role.description, 'The JotForm sync service account: reads persons and writes Friendly Calls & Visits reports')
  assert.equal(role.isSystem, 1)
  const [perms] = await withDb(c => c.query('SELECT permission FROM role_permission WHERE roleId = 10 ORDER BY permission'))
  assert.deepEqual(perms.map(p => p.permission), [
    'fcv_sync:read', 'fcv_sync:write', 'member:read', 'member:read_inactive',
    'person:read', 'village:read', 'volunteer:read', 'volunteer:read_inactive',
  ])
})

test('role 10 reads inactive members', async () => {
  const res = await vgCall('getPersons', { projection: ['detail'] }, { token: jfToken })
  assert.equal(res.status, 200)
  const row = res.json.find(p => p.personId === String(persons.quahogDroppedMember.id))
  assert.ok(row, 'person with a Dropped member record is visible')
  assert.equal(row.memberStatus, 'Dropped')
})

test('role 10 cannot write persons', async () => {
  const res = await vgCall('patchPerson', { personId: String(persons.quahogMember.id) },
    { token: jfToken, body: { firstName: 'Nope' } })
  assert.equal(res.status, 403)
})

test('fcv tables exist with the new columns', async () => {
  const [cols] = await withDb(c => c.query('SHOW COLUMNS FROM fcv_submission'))
  const names = cols.map(c => c.Field)
  for (const f of ['held', 'jotformUpdatedAt', 'dateDecision']) assert.ok(names.includes(f), `has ${f}`)
  assert.ok(!names.includes('fuzzyMemberName'), 'fuzzyMemberName is gone')
  for (const t of ['fcv_name_match', 'fcv_hold']) {
    const [rows] = await withDb(c => c.query('SHOW TABLES LIKE ?', [t]))
    assert.equal(rows.length, 1, `${t} exists`)
  }
})
