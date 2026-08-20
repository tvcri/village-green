import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'
import { withDb } from '../../lib/db.js'
import { auditRows } from './lib.js'

const STAFF_ID = 10
const scratch = String(villages.scratch.id)

test('person lifecycle writes create/update/delete audit rows', async () => {
  // create
  const created = await vgCall('createPerson', {}, {
    token: tokens.users.staff,
    body: { villageId: scratch, firstName: 'Audit', lastName: 'Person', phone: '401-555-0100' },
  })
  assert.equal(created.status, 201)
  const personId = created.json.personId

  let rows = await auditRows('person', personId)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].action, 'create')
  assert.equal(rows[0].userId, STAFF_ID)
  assert.equal(rows[0].changes.snapshot.lastName, 'Person')
  assert.equal(rows[0].changes.snapshot.phone, '401-555-0100')
  assert.ok('village' in rows[0].changes.snapshot, 'lookup column present in snapshot')

  // update: one changed field -> diff has it with old/new; unchanged fields absent
  const patched = await vgCall('patchPerson', { personId }, {
    token: tokens.users.staff, body: { phone: '401-555-0199' },
  })
  assert.equal(patched.status, 200)
  rows = await auditRows('person', personId)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].action, 'update')
  assert.deepEqual(rows[1].changes.diff.phone, { old: '401-555-0100', new: '401-555-0199' })
  assert.ok(!('lastName' in rows[1].changes.diff), 'unchanged field not in diff')

  // no-op: same value again -> no new row
  const noop = await vgCall('patchPerson', { personId }, {
    token: tokens.users.staff, body: { phone: '401-555-0199' },
  })
  assert.equal(noop.status, 200)
  rows = await auditRows('person', personId)
  assert.equal(rows.length, 2, 'no-op patch writes no audit row')

  // delete: snapshot row survives the entity
  const del = await vgCall('deletePerson', { personId }, { token: tokens.users.staff })
  assert.equal(del.status, 200)
  rows = await auditRows('person', personId)
  assert.equal(rows.length, 3)
  assert.equal(rows[2].action, 'delete')
  assert.equal(rows[2].changes.snapshot.lastName, 'Person')
})

test('person junction rewrite audits as a set diff on the parent', async () => {
  const created = await vgCall('createPerson', {}, {
    token: tokens.users.staff,
    body: { villageId: scratch, firstName: 'Set', lastName: 'Diff' },
  })
  assert.equal(created.status, 201)
  const personId = created.json.personId

  // The community catalog is empty on a fresh harness DB (person_community's
  // FK needs a real row) — seed one directly rather than depending on
  // catalog data this suite doesn't own.
  const communityId = await withDb(async (conn) => {
    const [result] = await conn.query(
      'INSERT INTO community (name) VALUES (?)', [`audit-test-${personId}`]
    )
    return result.insertId
  })

  // PersonPatch/PersonPost's schema property is `communities` (array of
  // CommunityId, a StringIntId), not `communityIds` — verified against
  // api/source/specification/village-green.yaml.
  const patched = await vgCall('patchPerson', { personId }, {
    token: tokens.users.staff, body: { communities: [String(communityId)] },
  })
  assert.equal(patched.status, 200)
  const rows = await auditRows('person', personId)
  const last = rows[rows.length - 1]
  assert.equal(last.action, 'update')
  assert.equal(last.changes.diff.communities.added.length, 1)
  assert.ok(!('removed' in last.changes.diff.communities))

  await vgCall('deletePerson', { personId }, { token: tokens.users.staff })
  await withDb(conn => conn.query('DELETE FROM community WHERE id = ?', [communityId]))
})
