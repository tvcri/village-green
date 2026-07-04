import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeDrift, loadBaseline } from '../generator/doctor.js'

const col = (name, over = {}) => ({ name, generated: false, autoIncrement: false, required: false, ...over })

test('doctor: builder column missing from schema is an error', () => {
  const meta = { widget: [col('id'), col('name')] }
  const ds = { widget: [{ id: 1, name: 'a', color: 'red' }] }
  const { errors } = analyzeDrift(meta, ds, ['widget'])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /widget\.color/)
})

test('doctor: unpopulated required column is an error', () => {
  const meta = { widget: [col('id'), col('created_by', { required: true })] }
  const ds = { widget: [{ id: 1 }] }
  const { errors } = analyzeDrift(meta, ds, ['widget'])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /widget\.created_by/)
  assert.match(errors[0], /NOT NULL/)
})

test('doctor: unset optional column NOT in baseline is an error', () => {
  const meta = { widget: [col('id'), col('created_by')] }
  const ds = { widget: [{ id: 1 }] }
  const { errors } = analyzeDrift(meta, ds, ['widget'])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /NEW unset column `widget\.created_by`/)
  assert.match(errors[0], /doctor-baseline/)
})

test('doctor: unset optional column in baseline is silently acknowledged', () => {
  const meta = { widget: [col('id'), col('created_by')] }
  const ds = { widget: [{ id: 1 }] }
  const { errors, notices, acknowledged } = analyzeDrift(meta, ds, ['widget'], { 'widget.created_by': 'not captured yet' })
  assert.equal(errors.length, 0)
  assert.equal(notices.length, 0)
  assert.equal(acknowledged, 1)
})

test('doctor: stale baseline entry (column now populated) is a notice', () => {
  const meta = { widget: [col('id'), col('created_by')] }
  const ds = { widget: [{ id: 1, created_by: 7 }] }
  const { errors, notices } = analyzeDrift(meta, ds, ['widget'], { 'widget.created_by': 'not captured yet' })
  assert.equal(errors.length, 0)
  assert.equal(notices.length, 1)
  assert.match(notices[0], /widget\.created_by.*stale/)
})

test('doctor: baseline entries for empty/unchecked tables are not flagged stale', () => {
  const meta = { widget: [col('id')] }
  const ds = { widget: [{ id: 1 }], other: [] }
  const { notices } = analyzeDrift(meta, ds, ['widget', 'other'], { 'other.legacy_col': 'other table not seeded' })
  assert.equal(notices.length, 0)
})

test('doctor: generated and auto_increment columns are ignored', () => {
  const meta = { widget: [col('id', { autoIncrement: true }), col('addr', { generated: true }), col('name')] }
  const ds = { widget: [{ name: 'a' }] }
  const { errors, notices } = analyzeDrift(meta, ds, ['widget'])
  assert.equal(errors.length, 0)
  assert.equal(notices.length, 0)
})

test('doctor: empty dataset tables are skipped; missing table with rows is an error', () => {
  const meta = {}
  const ds = { empty_table: [], gone_table: [{ id: 1 }] }
  const { errors } = analyzeDrift(meta, ds, ['empty_table', 'gone_table'])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /gone_table/)
})

test('doctor: baseline file loads and has reasons for every entry', () => {
  const baseline = loadBaseline()
  assert.ok(Object.keys(baseline).length >= 20)
  for (const [key, reason] of Object.entries(baseline)) {
    assert.match(key, /^[a-z_]+\.[a-zA-Z_]+$/, `bad baseline key ${key}`)
    assert.ok(typeof reason === 'string' && reason.length > 0, `baseline ${key} needs a reason`)
  }
})
