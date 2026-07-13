const path = require('path')
const logger = require('../../utils/logger')

// The village metrics subqueries all filter service_request on
// (villageId, serviceDate range, status). Without a composite index the only
// usable key is single-column villageId, so each subquery fetches every row
// for a village and post-filters serviceDate/status. This index serves the
// range and status predicates directly. (serviceDate stays NULLable to
// preserve the Draft workflow, which may create a request before a date is
// set; NULLs index fine and simply sort at the low end.)
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
