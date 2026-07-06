import { readFileSync } from 'node:fs'
import { TABLE_ORDER } from './constants.js'

// Schema-drift doctor: compare what the builders actually emit against the
// live DB schema, and fail loudly (with table.column names) at generation
// time instead of mid-load with a raw MySQL error.
//
// The generator's core convention: builders set ONLY the columns they mean;
// both load paths omit the rest so DB defaults apply. Every unset column must
// be either populated in a builder or acknowledged (with a reason) in
// doctor-baseline.json — so a new schema column always forces one explicit,
// git-recorded decision instead of slipping silently into the ignored pile.

export function loadBaseline () {
  const raw = JSON.parse(readFileSync(new URL('./doctor-baseline.json', import.meta.url), 'utf8'))
  delete raw._comment
  return raw
}

// Column metadata for the generator's tables from the live schema.
export async function columnMetaFromDb (conn, tables = TABLE_ORDER) {
  const meta = {}
  for (const t of tables) {
    const [rows] = await conn.query(
      'SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, EXTRA FROM INFORMATION_SCHEMA.COLUMNS ' +
      'WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
      [conn.config.database, t])
    if (!rows.length) continue // absent table is reported by analyzeDrift if it has rows to load
    meta[t] = rows.map(r => ({
      name: r.COLUMN_NAME,
      // ' GENERATED' (with space) matches VIRTUAL/STORED GENERATED but not
      // DEFAULT_GENERATED (plain DEFAULT CURRENT_TIMESTAMP / expression defaults)
      generated: / GENERATED/.test(r.EXTRA || ''),
      autoIncrement: /auto_increment/i.test(r.EXTRA || ''),
      required: r.IS_NULLABLE === 'NO' && r.COLUMN_DEFAULT === null &&
        !/auto_increment/i.test(r.EXTRA || '') && !/ GENERATED/.test(r.EXTRA || ''),
    }))
  }
  return meta
}

// Pure classification (no DB) so it's unit-testable.
// Returns { errors, notices, acknowledged }: errors block the load; notices
// are FYI (stale baseline entries); acknowledged counts baseline-covered
// unset columns.
export function analyzeDrift (columnMeta, dataset, tables = TABLE_ORDER, baseline = {}) {
  const errors = []
  const notices = []
  const acknowledgedKeys = new Set()
  const checkedTables = new Set()
  for (const table of tables) {
    const rows = dataset[table] || []
    if (!rows.length) continue // nothing to insert -> nothing can break
    const cols = columnMeta[table]
    if (!cols) {
      errors.push(`table \`${table}\` has ${rows.length} rows to load but does not exist in the schema`)
      continue
    }
    checkedTables.add(table)
    const byName = new Map(cols.map(c => [c.name, c]))
    const populated = new Set()
    for (const r of rows) for (const k of Object.keys(r)) populated.add(k)
    for (const k of populated) {
      if (!byName.has(k)) errors.push(`\`${table}.${k}\` is set by a builder but missing from the schema (renamed or dropped?)`)
      else if (byName.get(k).generated) errors.push(`\`${table}.${k}\` is a GENERATED column — the DB computes it; remove it from the builder`)
    }
    for (const c of cols) {
      if (populated.has(c.name) || c.generated || c.autoIncrement) continue
      const key = `${table}.${c.name}`
      if (c.required) {
        errors.push(`\`${key}\` is NOT NULL with no default and no builder sets it — inserts will fail`)
      } else if (key in baseline) {
        acknowledgedKeys.add(key)
      } else {
        errors.push(`NEW unset column \`${key}\` — populate it in a builder or acknowledge it (with a reason) in generator/doctor-baseline.json`)
      }
    }
  }
  // Baseline hygiene: entries for checked tables that are no longer unset
  // (column now populated, or gone from the schema) should be pruned.
  for (const key of Object.keys(baseline)) {
    const table = key.split('.')[0]
    if (checkedTables.has(table) && !acknowledgedKeys.has(key)) {
      notices.push(`baseline entry \`${key}\` is stale (column is now populated or no longer exists) — remove it from doctor-baseline.json`)
    }
  }
  return { errors, notices, acknowledged: acknowledgedKeys.size }
}
