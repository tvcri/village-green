const path = require('path')
const logger = require('../../utils/logger')

// A person's civic municipality, calculated from their street address via the
// US Census geocoder. Postal city is not the civic town in Rhode Island:
// 12.3% of seeded addresses disagree, and Burrillville's 107 members have the
// word "Burrillville" in none of their addresses.
//
// Free-form. NULL means unset — either never geocoded, or an address that
// does not resolve (~2% of the roster). There is no provenance column: the
// value is a name, and where it came from carries no meaning once stored.
//
// No index. The column is read as part of a person row and filtered by
// nothing at ~2000 rows; an index would cost writes on every person update
// for no measurable read benefit.
module.exports = {
  up: async (pool) => {
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', name: migrationName })
      await connection.query('ALTER TABLE person ADD COLUMN town VARCHAR(50) NULL AFTER zip')
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
      await connection.query('ALTER TABLE person DROP COLUMN town')
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  }
}
