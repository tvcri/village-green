const path = require('path')
const logger = require('../../utils/logger')

// Device class is derived client-side once per page load and stamped on every
// analytics event, so the admin summary can report device mix per route.
//
// Existing rows keep NULL, meaning "collected before device tracking existed"
// — deliberately distinct from the 'unknown' class, which means tracking ran
// and could not resolve a device.
//
// idx_analytics_route_time is redefined rather than supplemented, to keep the
// index COVERING for the summary query. That query groups by routeName alone
// and pivots device counts with SUM(deviceClass = ...) conditionals — so
// without deviceClass in the index it reads the table for every row; with it,
// EXPLAIN reports using_index: true.
//
// The trailing createdAt is not reachable as a range here (routeName sits
// between it and the equality on eventType), so from/to still filter after the
// scan — but that was equally true of the narrow index this replaces. Verified
// with EXPLAIN: eventType is the only used_key_part under all orderings.
//
// A second overlapping index would cost writes on an append-heavy table for no
// read benefit.
module.exports = {
  up: async (pool) => {
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', name: migrationName })

      await connection.query(`ALTER TABLE analytics_events
        ADD COLUMN deviceClass VARCHAR(16) NULL AFTER metadata`)

      await connection.query(`ALTER TABLE analytics_events
        DROP INDEX idx_analytics_route_time`)

      await connection.query(`ALTER TABLE analytics_events
        ADD INDEX idx_analytics_route_time (eventType, routeName, deviceClass, createdAt)`)
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

      await connection.query(`ALTER TABLE analytics_events
        DROP INDEX idx_analytics_route_time`)

      await connection.query(`ALTER TABLE analytics_events
        ADD INDEX idx_analytics_route_time (eventType, routeName, createdAt)`)

      await connection.query(`ALTER TABLE analytics_events
        DROP COLUMN deviceClass`)
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  }
}
