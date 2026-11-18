const path = require('path')
const logger = require('../../utils/logger')

// Staff answers on the LGL sync's holds (VG-202611-521).
//
// - resolution, resolvedAt, resolvedUserId: an unlinked LGL donor is a
//   question only a person can answer ("this is VG person X" or "this is
//   someone new"). Staff record the answer here through
//   POST /sync/holds/{holdId}/resolution; the sync (tvcri/vg-sync) carries out
//   the latest one by resolvedAt on its next pass and closes the hold.
//   resolution is {"kind":"link","personId":"…"} or {"kind":"create"}.
// - closedUserId: set only when a person closes a hold the sync never closes
//   itself (addressee, lgl-incomplete). NULL on a hold the sync closed.
//
// No foreign keys, as in 0033.
module.exports = {
  up: async (pool) => {
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', name: migrationName })
      await connection.query(`ALTER TABLE sync_hold
        ADD COLUMN resolution json NULL AFTER note,
        ADD COLUMN resolvedAt datetime(3) NULL AFTER resolution,
        ADD COLUMN resolvedUserId int NULL AFTER resolvedAt,
        ADD COLUMN closedUserId int NULL AFTER resolvedUserId`)
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  },

  down: async (pool) => {
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'down', name: migrationName })
      await connection.query(`ALTER TABLE sync_hold
        DROP COLUMN closedUserId, DROP COLUMN resolvedUserId, DROP COLUMN resolvedAt, DROP COLUMN resolution`)
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  }
}
