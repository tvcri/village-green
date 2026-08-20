// Shared assertions for audit_event rows. The harness DB is never reset
// between files, so ALWAYS filter by the entityId your test created.
import { withDb } from '../../lib/db.js'

export async function auditRows (entityType, entityId) {
  return withDb(async (conn) => {
    const [rows] = await conn.query(
      `SELECT auditId, entityType, entityId, action, userId, changes
       FROM audit_event WHERE entityType = ? AND entityId = ? ORDER BY auditId`,
      [entityType, entityId]
    )
    return rows.map(r => ({
      ...r,
      changes: typeof r.changes === 'string' ? JSON.parse(r.changes) : r.changes,
    }))
  })
}
