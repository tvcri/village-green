// Serialize the canonical dataset into the app-data JSONL format that
// GET /op/appdata produces and POST /op/appdata consumes:
//   line 1: {version, commit, date, lastMigration}
//   line 2: {tables:[{table,rowCount}], totalRows}
//   per table: {table, columns:"`a`,`b`", rowCount}  then one JSON array per row.

export function rowToArray (columns, obj) {
  return columns.map(c => (obj[c] === undefined ? null : obj[c]))
}

export function buildJsonl (dataset, columnMap, meta) {
  const tables = Object.keys(dataset).filter(t => (dataset[t] || []).length && columnMap[t])
  const lines = []
  lines.push(JSON.stringify({ version: meta.version, commit: meta.commit, date: meta.date, lastMigration: meta.lastMigration }))
  lines.push(JSON.stringify({
    tables: tables.map(t => ({ table: t, rowCount: dataset[t].length })),
    totalRows: tables.reduce((s, t) => s + dataset[t].length, 0),
  }))
  for (const t of tables) {
    const cols = columnMap[t]
    lines.push(JSON.stringify({ table: t, columns: cols.map(c => '`' + c + '`').join(','), rowCount: dataset[t].length }))
    for (const row of dataset[t]) lines.push(JSON.stringify(rowToArray(cols, row)))
  }
  return lines.join('\n') + '\n'
}

// Live-schema column order per table, excluding generated columns (e.g. person.address).
export async function columnMapFromDb (conn, tables) {
  const map = {}
  for (const t of tables) {
    const [rows] = await conn.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND EXTRA NOT LIKE '% GENERATED' " +
      'ORDER BY ORDINAL_POSITION',
      [conn.config.database, t])
    map[t] = rows.map(r => r.COLUMN_NAME)
  }
  return map
}
