const path = require('path')
const logger = require('../../utils/logger')

// Canonicalizes the three legacy no-space Errand spellings (CE-import era,
// ~29 frozen rows in production) to the with-space spellings the client's
// create form writes. Metrics GROUP BY serviceName then needs no query-time
// collapse, and SR-list serviceName filters stop showing duplicate values.
// The CE import pipeline is retired, so the variant population cannot recur.
module.exports = {
  up: async (pool) => {
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', name: migrationName })

      await connection.query(
        `UPDATE service_request SET serviceName = 'Errand: Shopping' WHERE serviceName = 'Errand:Shopping'`)
      await connection.query(
        `UPDATE service_request SET serviceName = 'Errand: Pick up/delivery' WHERE serviceName = 'Errand:Pick up/delivery'`)
      await connection.query(
        `UPDATE service_request SET serviceName = 'Errand: Other' WHERE serviceName = 'Errand:Other'`)
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  },

  down: async () => {
    // Intentionally empty: a data canonicalization has no faithful inverse
    // (which rows originally used the no-space spelling is not recorded).
  },
}
