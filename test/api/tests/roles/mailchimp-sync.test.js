import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'
import { persons } from '../../setup/fixtures.js'

// Role 9, Mailchimp Sync (migration 0036): the vg-sync Mailchimp service
// account. It only reads persons, with their member, volunteer and donor data.
// member:read and volunteer:read are there because a person is hidden from a
// caller who cannot read any of the person's associations.
const mcToken = tokens.users.mailchimp

test('role 9 exists with exactly four permissions', async () => {
  const [[role]] = await withDb(c => c.query('SELECT * FROM role WHERE roleId = 9'))
  assert.ok(role, 'role 9 exists')
  assert.equal(role.name, 'Mailchimp Sync')
  assert.equal(role.scope, 'federation')
  assert.equal(role.description, 'The Mailchimp sync service account: reads persons and donors')
  assert.equal(role.isSystem, 1)
  const [perms] = await withDb(c => c.query('SELECT permission FROM role_permission WHERE roleId = 9 ORDER BY permission'))
  assert.deepEqual(perms.map(p => p.permission), ['donor:read', 'member:read', 'person:read', 'volunteer:read'])
})

test('role 9 reads persons with statuses, donor and detail', async () => {
  const res = await vgCall('getPersons', { projection: ['detail'] }, { token: mcToken })
  assert.equal(res.status, 200)
  assert.ok(res.json.length > 0)
  const row = res.json.find(p => p.personId === String(persons.quahogMember.id))
  assert.ok(row, 'member person visible')
  assert.ok('memberStatus' in row)
  assert.ok('volunteerStatus' in row)
  assert.ok('donor' in row)
  assert.equal(row.detail.firstName, persons.quahogMember.firstName)
})

test('role 9 cannot write persons', async () => {
  const res = await vgCall('patchPerson', { personId: String(persons.quahogMember.id) },
    { token: mcToken, body: { firstName: 'Nope' } })
  assert.equal(res.status, 403)
})
