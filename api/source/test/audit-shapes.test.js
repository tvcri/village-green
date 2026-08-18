const { test } = require('node:test')
const assert = require('node:assert/strict')
const { shapes, assertShapeInvariants } = require('../service/audit/shapes')

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
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a', 'a'], redacted: [], sets: {} }))
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: ['b'], sets: {} }))
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: [], sets: { a: { kind: 'values', sql: 's' } } }))
  assert.throws(() => assertShapeInvariants('x', { table: 't', columns: ['a'], redacted: [], sets: { s: { kind: 'bogus', sql: 's' } } }))
})
