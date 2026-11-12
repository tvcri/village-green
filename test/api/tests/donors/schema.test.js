import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withDb } from '../../lib/db.js'

// The donor association (migration 0032): one row per person, LGL-sourced.
// The constituent ID is required but not unique (an LGL couple is one
// constituent shared by two persons); the last gift date may be absent.

test('donor table exists with the spec columns', async () => {
  const cols = await withDb(async (db) => (await db.query('SHOW COLUMNS FROM donor'))[0])
  assert.deepEqual(cols.map(c => c.Field), ['id', 'personId', 'lglConstituentId', 'lastGiftDate'])
  const byName = Object.fromEntries(cols.map(c => [c.Field, c]))
  assert.equal(byName.lglConstituentId.Null, 'NO')
  assert.equal(byName.lastGiftDate.Null, 'YES')
  assert.equal(byName.personId.Key, 'UNI')
})

test('Staff holds donor:read; only Sync Service holds donor:write', async () => {
  const rows = await withDb(async (db) => (await db.query(
    `SELECT r.name, rp.permission FROM role_permission rp JOIN role r USING (roleId)
     WHERE rp.permission LIKE 'donor:%' ORDER BY r.name, rp.permission`))[0])
  assert.deepEqual(rows.map(r => ({ ...r })), [
    { name: 'Staff', permission: 'donor:read' },
    { name: 'Sync Service', permission: 'donor:read' },
    { name: 'Sync Service', permission: 'donor:write' },
  ])
})
