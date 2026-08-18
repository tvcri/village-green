const { test } = require('node:test')
const assert = require('node:assert/strict')
const { computeChanges, buildSnapshot, normalize } = require('../service/audit/diff')

const SHAPE = {
  columns: ['name', 'status', { name: 'village', expr: 'ignored-by-differ' }, 'secret', 'meta'],
  redacted: ['secret'],
  sets: {
    tags: { kind: 'values', sql: 'ignored' },
    certs: { kind: 'keyed', sql: 'ignored', key: 'k' },
  },
}

test('update: identical rows -> null (no-op suppression)', () => {
  const row = { name: 'a', status: 'Open', village: 'Quahog', secret: null, meta: null }
  assert.equal(computeChanges(SHAPE, { action: 'update', before: row, after: { ...row } }), null)
})

test('update: unconditionally rewritten same-value field does not appear', () => {
  const before = { name: 'a', status: 'Open', village: 'V', secret: null, meta: null }
  const after = { ...before, name: 'b' } // status "written" but unchanged
  const c = computeChanges(SHAPE, { action: 'update', before, after })
  assert.deepEqual(c, { diff: { name: { old: 'a', new: 'b' } } })
})

test('update: redacted field -> {changed:true}, value leaks nowhere', () => {
  const before = { name: 'a', status: 'Open', village: 'V', secret: 'hush', meta: null }
  const after = { ...before, secret: 'hush2' }
  const c = computeChanges(SHAPE, { action: 'update', before, after })
  assert.deepEqual(c.diff.secret, { changed: true })
  assert.ok(!JSON.stringify(c).includes('hush'))
})

test('update: null and empty string are distinct', () => {
  const before = { name: '', status: null, village: 'V', secret: null, meta: null }
  const after = { name: null, status: '', village: 'V', secret: null, meta: null }
  const c = computeChanges(SHAPE, { action: 'update', before, after })
  assert.deepEqual(c.diff.name, { old: '', new: null })
  assert.deepEqual(c.diff.status, { old: null, new: '' })
})

test('normalize: Date -> ISO string, Buffer -> hex, scalars pass through', () => {
  assert.equal(normalize(new Date('2026-08-18T12:00:00.000Z')), '2026-08-18T12:00:00.000Z')
  assert.equal(normalize(Buffer.from([0xab, 0xcd])), 'abcd')
  assert.equal(normalize('x'), 'x')
  assert.equal(normalize(5), 5)
  assert.equal(normalize(true), true)
  assert.equal(normalize(null), null)
  assert.equal(normalize(undefined), null)
})

test('update: equal Dates do not diff; changed Dates diff as ISO strings', () => {
  const t1 = new Date('2026-01-01T00:00:00.000Z')
  const before = { name: 'a', status: t1, village: 'V', secret: null, meta: null }
  const same = computeChanges(SHAPE, { action: 'update', before, after: { ...before, status: new Date(t1) } })
  assert.equal(same, null)
  const c = computeChanges(SHAPE, { action: 'update', before, after: { ...before, status: new Date('2026-02-01T00:00:00.000Z') } })
  assert.deepEqual(c.diff.status, { old: '2026-01-01T00:00:00.000Z', new: '2026-02-01T00:00:00.000Z' })
})

test('update: JSON values deep-equal with reordered keys', () => {
  const before = { name: 'a', status: 'S', village: 'V', secret: null, meta: { a: 1, b: [1, 2] } }
  const after = { ...before, meta: { b: [1, 2], a: 1 } }
  assert.equal(computeChanges(SHAPE, { action: 'update', before, after }), null)
})

test('value-set diff: added/removed, empty keys omitted, no-change omitted entirely', () => {
  const before = { name: 'a', status: 'S', village: 'V', secret: null, meta: null }
  const c = computeChanges(SHAPE, {
    action: 'update', before, after: { ...before },
    beforeSets: { tags: [{ label: 'x' }, { label: 'y' }], certs: [] },
    afterSets: { tags: [{ label: 'y' }, { label: 'z' }], certs: [] },
  })
  assert.deepEqual(c, { diff: { tags: { added: ['z'], removed: ['x'] } } })
})

test('keyed-set diff: added/removed objects, changed rows as {key, old, new}', () => {
  const row = { name: 'a', status: 'S', village: 'V', secret: null, meta: null }
  const c = computeChanges(SHAPE, {
    action: 'update', before: row, after: { ...row },
    beforeSets: { tags: [], certs: [{ k: 'CPR 2025-01-01', type: 'CPR', expires: '2026-01-01' }, { k: 'BGC 2024-06-01', type: 'BGC', expires: null }] },
    afterSets: { tags: [], certs: [{ k: 'CPR 2025-01-01', type: 'CPR', expires: '2027-01-01' }, { k: 'FA 2026-08-01', type: 'FA', expires: null }] },
  })
  assert.deepEqual(c.diff.certs.removed, [{ k: 'BGC 2024-06-01', type: 'BGC', expires: null }])
  assert.deepEqual(c.diff.certs.added, [{ k: 'FA 2026-08-01', type: 'FA', expires: null }])
  assert.deepEqual(c.diff.certs.changed, [{ key: 'CPR 2025-01-01', old: { k: 'CPR 2025-01-01', type: 'CPR', expires: '2026-01-01' }, new: { k: 'CPR 2025-01-01', type: 'CPR', expires: '2027-01-01' } }])
})

test('create -> {snapshot} of after; delete -> {snapshot} of before; redaction sentinel', () => {
  const row = { name: 'a', status: 'S', village: 'V', secret: 'hush', meta: null }
  const sets = { tags: [{ label: 'x' }], certs: [] }
  const created = computeChanges(SHAPE, { action: 'create', after: row, afterSets: sets })
  assert.deepEqual(created.snapshot, { name: 'a', status: 'S', village: 'V', secret: '[redacted]', meta: null, tags: ['x'], certs: [] })
  const deleted = computeChanges(SHAPE, { action: 'delete', before: { ...row, secret: null }, beforeSets: sets })
  assert.equal(deleted.snapshot.secret, null) // null stays null, not '[redacted]'
})

test('buildSnapshot tolerates missing sets and missing columns (records null)', () => {
  const snap = buildSnapshot(SHAPE, { name: 'a' }, undefined)
  assert.equal(snap.status, null)
  assert.deepEqual(snap.tags, [])
})
