const path = require('path')
const logger = require('../../utils/logger')

// serviceDate was nullable only to serve the Draft workflow, which could
// create a request before a date was chosen. Draft is now excised, so an
// undated request is unreachable from every list (`serviceDate >= ?` is
// UNKNOWN for NULL) and no longer creatable. NOT NULL makes that explicit.
//
// No data migration accompanies this: production and the dev snapshot both
// carry zero NULL serviceDate rows. An install that somehow holds one will
// see this ALTER fail loudly rather than corrupt data — fix the row and
// re-run.
module.exports = {
  up: async (pool) => {
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', name: migrationName })

      await connection.query(
        `ALTER TABLE service_request MODIFY serviceDate DATE NOT NULL`)
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  },

  down: async () => {
    // Intentionally empty: re-widening the column would not restore any rows,
    // and nothing in the schema depends on serviceDate being nullable.
  },
}
