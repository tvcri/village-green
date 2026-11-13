import { withDb, insertRows } from './db.js'
import { TABLE_ORDER, PRESERVED_TABLES } from './constants.js'

// Empty EVERY base table except the migration-owned catalogs, not just the
// tables the generator fills. A database that held other data (a restored
// production snapshot, say) must not keep rows the generator knows nothing
// about: donors with real LGL ids, audit_event history, trainings, enrollment
// requests, all pointing at person ids that now belong to invented people.
// Listing the tables from the schema means a new migration's table is wiped
// without anyone having to remember it here.
export async function tablesToTruncate (conn) {
  const [rows] = await conn.query(
    "SELECT TABLE_NAME AS t FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
    [conn.config.database])
  return rows.map(r => r.t).filter(t => !PRESERVED_TABLES.includes(t))
}

export async function seedSql (dataset) {
  return withDb(async (conn) => {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const t of await tablesToTruncate(conn)) await conn.query('TRUNCATE TABLE `' + t + '`')
    const inserted = {}
    for (const t of TABLE_ORDER) {
      const rows = dataset[t] || []
      await insertRows(conn, t, rows)
      inserted[t] = rows.length
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1')
    return { inserted }
  })
}
