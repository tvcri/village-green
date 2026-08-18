const { test } = require('node:test')
const assert = require('node:assert/strict')
const { shapes, assertShapeInvariants } = require('../service/audit/shapes')
const { buildRowSql, undeclaredColumns } = require('../service/audit/AuditService')

test('registry declares exactly the five v1 entity types', () => {
  assert.deepEqual(Object.keys(shapes).sort(), ['member', 'person', 'serviceRequest', 'user', 'volunteer'])
})

test('every registry entry passes its own invariants', () => {
  for (const [entityType, shape] of Object.entries(shapes)) {
    assertShapeInvariants(entityType, shape) // throws on failure
  }
})

test('member redacts confidentialNotes and householdDues', () => {
  assert.ok(shapes.member.redacted.includes('confidentialNotes'))
  assert.ok(shapes.member.redacted.includes('householdDues'))
})

test('invariants reject duplicate columns, redacted-not-in-columns, set/column collisions', () => {
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a', 'a'], redacted: [], excluded: [], sets: {} }))
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: ['b'], excluded: [], sets: {} }))
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: [], excluded: [], sets: { a: { kind: 'values', sql: 's' } } }))
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: [], excluded: [], sets: { s: { kind: 'bogus', sql: 's' } } }))
})

test('invariants require explicit redacted and excluded arrays, and excluded stays disjoint', () => {
  // omitting redacted must fail loudly — diff.js dereferences it unguarded
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], excluded: [], sets: {} }), /redacted/)
  // omitting excluded must fail loudly — the omission check depends on it
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: [], sets: {} }), /excluded/)
  // a column cannot be both audited and excluded
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: [], excluded: ['a'], sets: {} }), /excluded 'a'/)
  // the id column is covered structurally, never listed
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: [], excluded: ['id'], sets: {} }), /id column/)
})

test('undeclaredColumns flags real columns absent from columns+excluded+idColumn', () => {
  const shape = { table: 't', columns: ['a', { name: 'v', expr: 'x' }], redacted: [], excluded: ['b'], sets: {} }
  assert.deepEqual(undeclaredColumns(shape, ['id', 'a', 'b']), [])
  assert.deepEqual(undeclaredColumns(shape, ['id', 'a', 'b', 'newCol']), ['newCol'])
  const custom = { table: 'u', idColumn: 'userId', columns: ['username'], redacted: [], excluded: [], sets: {} }
  assert.deepEqual(undeclaredColumns(custom, ['userId', 'username']), [])
  assert.deepEqual(undeclaredColumns(custom, ['userId', 'username', 'created']), ['created'])
})

test('exclusion lists carry the deliberate omissions as data, not prose', () => {
  for (const c of ['created', 'lastAccess', 'lastClaims', 'statusDate', 'statusUser', 'webPreferences']) {
    assert.ok(shapes.user.excluded.includes(c), `user excluded misses ${c}`)
  }
  for (const c of ['modifiedUserId', 'modifiedAt', 'createdUserId', 'createdAt', 'villageId']) {
    assert.ok(shapes.serviceRequest.excluded.includes(c), `serviceRequest excluded misses ${c}`)
  }
  for (const c of ['villageId', 'fullName', 'address']) {
    assert.ok(shapes.person.excluded.includes(c), `person excluded misses ${c}`)
  }
})

test('buildRowSql selects bare columns verbatim and exprs with aliases, keyed by idColumn', () => {
  const sql = buildRowSql({
    table: 'person', columns: ['lastName', { name: 'village', expr: '(SELECT 1)' }], redacted: [], sets: {},
  })
  assert.equal(sql, 'SELECT t.`lastName`, (SELECT 1) AS `village` FROM person t WHERE t.`id` = ?')
  const sqlUser = buildRowSql({ table: 'user_data', idColumn: 'userId', columns: ['username'], redacted: [], sets: {} })
  assert.equal(sqlUser, 'SELECT t.`username` FROM user_data t WHERE t.`userId` = ?')
})
