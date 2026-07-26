const path = require('path')
const logger = require('../../utils/logger')

// Explicit "start" leg for service requests. Nullable columns mirror the
// existing destination block: a bare `start` name label (peer of `destination`)
// plus startAddress/startCity/startState/startZip/startPhone. No isHome flag —
// start is authoritative field data; "member's home" is only a client-side fill
// convenience. No backfill: existing rows keep NULL start*.
module.exports = {
  up: async (pool) => {
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', name: migrationName })

      await connection.query(`ALTER TABLE service_request
        ADD COLUMN \`start\` TEXT,
        ADD COLUMN startAddress TEXT,
        ADD COLUMN startCity VARCHAR(100),
        ADD COLUMN startState VARCHAR(50),
        ADD COLUMN startZip VARCHAR(20),
        ADD COLUMN startPhone VARCHAR(50)`)
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

      await connection.query(`ALTER TABLE service_request
        DROP COLUMN \`start\`,
        DROP COLUMN startAddress,
        DROP COLUMN startCity,
        DROP COLUMN startState,
        DROP COLUMN startZip,
        DROP COLUMN startPhone`)
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  }
}
