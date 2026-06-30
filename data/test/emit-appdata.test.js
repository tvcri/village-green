import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowToArray, buildJsonl } from '../generator/emit-appdata.js'

test('rowToArray maps named fields to column order, missing -> null', () => {
  assert.deepEqual(rowToArray(['id', 'name', 'note'], { id: 1, name: 'x' }), [1, 'x', null])
})

test('buildJsonl emits version, summary, per-table header + row arrays', () => {
  const dataset = { village: [{ id: 1, name: 'Arkham' }, { id: 2, name: 'Quahog' }] }
  const columnMap = { village: ['id', 'name'] }
  const meta = { version: '1.0.0', commit: { sha: 'na' }, date: '2026-06-30T12:00:00.000Z', lastMigration: 6 }
  const lines = buildJsonl(dataset, columnMap, meta).trim().split('\n').map(JSON.parse)
  assert.equal(lines[0].lastMigration, 6)
  assert.deepEqual(lines[1], { tables: [{ table: 'village', rowCount: 2 }], totalRows: 2 })
  assert.deepEqual(lines[2], { table: 'village', columns: '`id`,`name`', rowCount: 2 })
  assert.deepEqual(lines[3], [1, 'Arkham'])
  assert.deepEqual(lines[4], [2, 'Quahog'])
})
