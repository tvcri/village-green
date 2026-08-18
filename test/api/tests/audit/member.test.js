import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'
import { withDb } from '../../lib/db.js'
import { auditRows } from './lib.js'

const STAFF_ID = 10
const scratch = String(villages.scratch.id)

async function memberIdFor (personId) {
  return withDb(async (conn) => {
    const [rows] = await conn.query('SELECT id FROM member WHERE personId = ?', [personId])
    return rows[0]?.id
  })
}

test('member put(create)/patch/delete audit lifecycle with redaction', async () => {
  const person = await vgCall('createPerson', {}, {
    token: tokens.users.staff,
    body: { villageId: scratch, firstName: 'Member', lastName: 'Audit' },
  })
  assert.equal(person.status, 201)
  const personId = person.json.personId

  // PUT with no existing row -> action 'create'
  const put = await vgCall('putPersonMember', { personId }, {
    token: tokens.users.staff,
    body: { status: 'Active', memberLevel: 'Household', joinDate: '2026-01-15', confidentialNotes: 'the-secret-text' },
  })
  assert.equal(put.status, 200)
  const memberId = await memberIdFor(personId)
  assert.ok(memberId)

  let rows = await auditRows('member', memberId)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].action, 'create')
  assert.equal(rows[0].userId, STAFF_ID)
  assert.equal(rows[0].changes.snapshot.status, 'Active')
  assert.equal(rows[0].changes.snapshot.confidentialNotes, '[redacted]')
  assert.ok(!JSON.stringify(rows[0].changes).includes('the-secret-text'), 'redacted value never appears')

  // PATCH a redacted field -> {changed: true}, value still absent
  const patch = await vgCall('patchPersonMember', { personId }, {
    token: tokens.users.staff, body: { confidentialNotes: 'the-second-secret' },
  })
  assert.equal(patch.status, 200)
  rows = await auditRows('member', memberId)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].action, 'update')
  assert.deepEqual(rows[1].changes.diff.confidentialNotes, { changed: true })
  assert.ok(!JSON.stringify(rows[1].changes).includes('secret'))

  // DELETE -> snapshot survives
  const del = await vgCall('deletePersonMember', { personId }, { token: tokens.users.staff })
  assert.equal(del.status, 204)
  rows = await auditRows('member', memberId)
  assert.equal(rows.length, 3)
  assert.equal(rows[2].action, 'delete')
  assert.equal(String(rows[2].changes.snapshot.personId), personId)

  await vgCall('deletePerson', { personId }, { token: tokens.users.staff })
})
