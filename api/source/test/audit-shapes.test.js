const { test } = require('node:test')
const assert = require('node:assert/strict')
const { shapes, assertShapeInvariants } = require('../service/audit/shapes')
const { buildRowSql, undeclaredColumns, unaccountedReferencingTables } = require('../service/audit/AuditService')

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
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a', 'a'], redacted: [], excluded: [], relatedTables: [], sets: {} }))
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: ['b'], excluded: [], relatedTables: [], sets: {} }))
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: [], excluded: [], relatedTables: [], sets: { a: { kind: 'values', sql: 's', table: 'j' } } }))
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: [], excluded: [], relatedTables: [], sets: { s: { kind: 'bogus', sql: 's', table: 'j' } } }))
})

test('invariants require set source tables and an explicit relatedTables array', () => {
  // a set must name its source table as data — the FK scan depends on it
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: [], excluded: [], relatedTables: [], sets: { s: { kind: 'values', sql: 's?' } } }), /source table/)
  // omitting relatedTables must fail loudly — the FK scan depends on it
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: [], excluded: [], sets: {} }), /relatedTables/)
  // a table cannot be both a folded set source and related-not-folded
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: [], excluded: [], relatedTables: ['j'], sets: { s: { kind: 'values', sql: 's?', table: 'j' } } }), /relatedTables 'j'/)
})

test('unaccountedReferencingTables buckets FK-referencing tables correctly', () => {
  const registry = {
    person: {
      table: 'person', columns: ['a'], redacted: [], excluded: [], relatedTables: ['fcv'],
      sets: { communities: { kind: 'values', sql: 's?', table: 'person_community' } },
    },
    member: { table: 'member', columns: ['a'], redacted: [], excluded: [], relatedTables: [], sets: {} },
  }
  const fk = (t, ref) => ({ TABLE_NAME: t, REFERENCED_TABLE_NAME: ref })
  // set source, audited entity, relatedTables entry, and refs to non-audited tables: all accounted
  assert.deepEqual(unaccountedReferencingTables(registry, [
    fk('person_community', 'person'), fk('member', 'person'), fk('fcv', 'person'), fk('anything', 'village'),
  ]), [])
  // an unknown junction is reported once per entity, deduped across multiple FKs
  assert.deepEqual(unaccountedReferencingTables(registry, [
    fk('person_address', 'person'), fk('person_address', 'person'),
  ]), [{ table: 'person_address', entityType: 'person' }])
})

test('relatedTables carry the deliberate non-folds as data', () => {
  for (const t of ['enrollment_request', 'fcv_submission']) {
    assert.ok(shapes.person.relatedTables.includes(t), `person relatedTables misses ${t}`)
  }
  for (const t of ['privacy_acknowledgement', 'privacy_rules', 'user_group']) {
    assert.ok(shapes.user.relatedTables.includes(t), `user relatedTables misses ${t}`)
  }
  assert.ok(shapes.serviceRequest.relatedTables.includes('notification_event'))
  // every set names its source table
  for (const [entityType, shape] of Object.entries(shapes)) {
    for (const [name, decl] of Object.entries(shape.sets)) {
      assert.equal(typeof decl.table, 'string', `${entityType}.${name} missing source table`)
    }
  }
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
