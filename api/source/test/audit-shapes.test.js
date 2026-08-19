const { test } = require('node:test')
const assert = require('node:assert/strict')
const { shapes, assertShapeInvariants } = require('../service/audit/shapes')
const { buildRowSql, shadowedAliases, unaccountedReferencingTables, requiredSetAlias } = require('../service/audit/AuditService')

test('registry declares exactly the five v1 entity types', () => {
  assert.deepEqual(Object.keys(shapes).sort(), ['member', 'person', 'serviceRequest', 'user', 'volunteer'])
})

test('every registry entry passes its own invariants', () => {
  for (const [entityType, shape] of Object.entries(shapes)) {
    assertShapeInvariants(entityType, shape) // throws on failure
  }
})

test('invariants: extras need name+expr with unique names, not colliding with set names', () => {
  const base = { table: 't', relatedTables: [], sets: {} }
  assert.throws(() => assertShapeInvariants('x', { ...base, extras: [{ expr: 'e' }] }), /name/)
  assert.throws(() => assertShapeInvariants('x', { ...base, extras: [{ name: 'v' }] }), /expr/)
  assert.throws(() => assertShapeInvariants('x', { ...base, extras: [{ name: 'v', expr: 'e' }, { name: 'v', expr: 'e2' }] }), /duplicate/)
  assert.throws(() => assertShapeInvariants('x', {
    ...base,
    extras: [{ name: 's', expr: 'e' }],
    sets: { s: { kind: 'values', sql: 's?', table: 'j' } },
  }), /collides/)
})

test('invariants: set declarations carry kind/key/sql/table; relatedTables required and disjoint', () => {
  const base = { table: 't', relatedTables: [], sets: {} }
  assert.throws(() => assertShapeInvariants('x', { ...base, sets: { s: { kind: 'bogus', sql: 's?', table: 'j' } } }), /kind/)
  assert.throws(() => assertShapeInvariants('x', { ...base, sets: { s: { kind: 'keyed', sql: 's?', table: 'j' } } }), /key/)
  assert.throws(() => assertShapeInvariants('x', { ...base, sets: { s: { kind: 'values', sql: 's', table: 'j' } } }), /placeholder/)
  assert.throws(() => assertShapeInvariants('x', { ...base, sets: { s: { kind: 'values', sql: 's?' } } }), /source table/)
  assert.throws(() => assertShapeInvariants('x', { table: 't', sets: {} }), /relatedTables/)
  assert.throws(() => assertShapeInvariants('x', {
    table: 't', relatedTables: ['j'],
    sets: { s: { kind: 'values', sql: 's?', table: 'j' } },
  }), /relatedTables 'j'/)
})

test('buildRowSql selects the whole row plus extras, keyed by idColumn', () => {
  const sql = buildRowSql({
    table: 'person', extras: [{ name: 'village', expr: '(SELECT 1)' }], relatedTables: [], sets: {},
  })
  assert.equal(sql, 'SELECT t.*, (SELECT 1) AS `village` FROM person t WHERE t.`id` = ?')
  const sqlUser = buildRowSql({ table: 'user_data', idColumn: 'userId', relatedTables: [], sets: {} })
  assert.equal(sqlUser, 'SELECT t.* FROM user_data t WHERE t.`userId` = ?')
})

test('shadowedAliases flags extras/set names that would hide a real column', () => {
  const shape = {
    table: 't', relatedTables: [],
    extras: [{ name: 'village', expr: 'e' }],
    sets: { communities: { kind: 'values', sql: 's?', table: 'j' } },
  }
  assert.deepEqual(shadowedAliases(shape, ['id', 'villageId', 'name']), [])
  assert.deepEqual(shadowedAliases(shape, ['id', 'village', 'communities']), ['village', 'communities'])
})

test('requiredSetAlias names exactly the alias the differ reads', () => {
  assert.equal(requiredSetAlias({ kind: 'values' }), 'label')
  assert.equal(requiredSetAlias({ kind: 'keyed', key: 'k' }), 'k')
})

test('unaccountedReferencingTables buckets FK-referencing tables correctly', () => {
  const registry = {
    person: {
      table: 'person', relatedTables: ['fcv'],
      sets: { communities: { kind: 'values', sql: 's?', table: 'person_community' } },
    },
    member: { table: 'member', relatedTables: [], sets: {} },
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
