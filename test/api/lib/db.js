// Direct DB access for the few assertions that must inspect rows the API doesn't
// expose (e.g. email_event side effects in the lifecycle tests).
import mysql from 'mysql2/promise'
import { config } from '../setup/env.js'

export async function withDb (fn) {
  const conn = await mysql.createConnection({
    host: config.db.host, port: config.db.port,
    user: config.db.user, password: config.db.password, database: config.db.schema,
  })
  try {
    return await fn(conn)
  } finally {
    await conn.end()
  }
}
