const path = require('path')
const logger = require('../../utils/logger')

// The VG → Mailchimp sync (repo tvcri/vg-sync, src/vg-mailchimp) reaches VG
// only through the API, as its own service account, and only reads
// GET /persons?projection=detail with donor data. This migration gives it
// role 9, Mailchimp Sync: read-only, and exactly the four permissions the read
// needs. member:read and volunteer:read are there because a person is hidden
// from a caller who cannot read any of the person's associations, and the
// audience must see everyone. Not member:read_inactive or
// volunteer:read_inactive. The grant itself is per-install data and is made in
// the admin UI. Roles are static catalog rows (20-vg-static.sql).
const ROLE_ID = 9
const PERMISSIONS = ['person:read', 'member:read', 'volunteer:read', 'donor:read']

module.exports = {
  up: async (pool) => {
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', name: migrationName })
      await connection.query(
        `INSERT INTO role (roleId, name, scope, description, isSystem) VALUES (?, 'Mailchimp Sync', 'federation',
          'The Mailchimp sync service account: reads persons and donors', 1)`,
        [ROLE_ID]
      )
      const [res] = await connection.query(
        'INSERT INTO role_permission (roleId, permission) VALUES ?',
        [PERMISSIONS.map(p => [ROLE_ID, p])]
      )
      logger.writeInfo('mysql', 'migration', {
        status: 'progress', name: migrationName, permissionRowsInserted: res.affectedRows
      })
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
      await connection.query('DELETE FROM role_permission WHERE roleId = ?', [ROLE_ID])
      await connection.query('DELETE FROM role WHERE roleId = ?', [ROLE_ID])
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  }
}
