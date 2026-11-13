import mysql from 'mysql2/promise'
import { config } from './env.js'

export async function withDb (fn) {
  const conn = await mysql.createConnection({
    host: config.db.host, port: config.db.port,
    user: config.db.user, password: config.db.password,
    database: config.db.database, multipleStatements: false,
  })
  try { return await fn(conn) } finally { await conn.end() }
}

// Generic bulk insert; keys are exact column names. The column list is the
// UNION of every row's keys (as emit-appdata.js does), so a column a builder
// sets on only some rows (person.isVeteran) still lands; rows without it get
// NULL, so a NOT NULL column must be set on every row.
export async function insertRows (conn, table, rows) {
  if (!rows.length) return
  const present = new Set()
  for (const r of rows) for (const k of Object.keys(r)) present.add(k)
  const cols = [...present]
  const colSql = cols.map(c => '`' + c + '`').join(',')
  const values = rows.map(r => cols.map(c => (r[c] === undefined ? null : r[c])))
  await conn.query('INSERT INTO `' + table + '` (' + colSql + ') VALUES ?', [values])
}
