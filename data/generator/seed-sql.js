import { withDb, insertRows } from './db.js'
import { TABLE_ORDER } from './constants.js'

// Child-before-parent truncation order (reverse of insert order).
const TRUNCATE_ORDER = [...TABLE_ORDER].reverse()

export async function seedSql (dataset) {
  return withDb(async (conn) => {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const t of TRUNCATE_ORDER) {
      try { await conn.query('TRUNCATE TABLE `' + t + '`') } catch (e) {
        if (e.code !== 'ER_NO_SUCH_TABLE') throw e
      }
    }
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
