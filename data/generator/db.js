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

// Generic bulk insert. All rows must share the same key set; keys are exact column names.
export async function insertRows (conn, table, rows) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const colSql = cols.map(c => '`' + c + '`').join(',')
  const values = rows.map(r => cols.map(c => (r[c] === undefined ? null : r[c])))
  await conn.query('INSERT INTO `' + table + '` (' + colSql + ') VALUES ?', [values])
}
