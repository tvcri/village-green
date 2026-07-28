const path = require('path')
const logger = require('../../utils/logger')

// The village metrics subqueries all filter service_request on
// (villageId, serviceDate range, status). Without a composite index the only
// usable key is single-column villageId, so each subquery fetches every row
// for a village and post-filters serviceDate/status. This index serves the
// range and status predicates directly. (serviceDate was NULLable when this
// index was added; migration 0021 made it NOT NULL after the Draft workflow
// was excised. NULLs indexed fine either way.)
module.exports = {
  up: async (pool) => {
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', name: migrationName })

      await connection.query(`ALTER TABLE service_request
        ADD INDEX idx_sr_village_date_status (villageId, serviceDate, status)`)
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
        DROP INDEX idx_sr_village_date_status`)
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  }
}
