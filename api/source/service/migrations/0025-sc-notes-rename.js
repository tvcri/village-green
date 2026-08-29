const path = require('path')
const logger = require('../../utils/logger')

// Rename member.confidentialNotes to member.scNotes, and the permission that
// gates it from person:read_confidential to member:read_sc_note.
//
// Two naming defects, one change:
//
//   1. The column name described a classification ("confidential") rather than
//      the field's purpose. The notes are operational instructions addressed to
//      a service coordinator — "her daughter calls in the requests, contact her,
//      not the member" — and the UI now labels them Service Coordinator Notes.
//
//   2. The permission was namespaced person:*, but the column has always lived
//      on member. It was named for the service that enforces it (PersonService,
//      via the getPerson member projection) rather than for the data it gates.
//      member:read_sc_note matches its siblings member:read_financial and
//      member:read_inactive. Singular _note, following the catalog's convention
//      that no qualifier is pluralised.
//
// active_member is a SELECT * view, so MySQL expanded confidentialNotes into
// its stored definition at creation time. Renaming the column without
// recreating the view leaves it referencing a column that no longer exists, so
// the view is rebuilt here — see CLAUDE.md.
//
// role_permission.permission is a plain varchar with no FK to a catalog table,
// so re-pointing the two existing grant rows is a straight UPDATE. Both roles
// that hold it today — Staff (5) and Service Coordinator (7) — keep it: this is
// a rename, not an access change.
const OLD_PERM = 'person:read_confidential'
const NEW_PERM = 'member:read_sc_note'

const ACTIVE_MEMBER_VIEW = `CREATE OR REPLACE VIEW active_member AS
  SELECT * FROM member WHERE status = 'Active'`

module.exports = {
  up: async (pool) => {
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', name: migrationName })
      await connection.query('ALTER TABLE member RENAME COLUMN confidentialNotes TO scNotes')
      await connection.query(ACTIVE_MEMBER_VIEW)
      const [res] = await connection.query(
        'UPDATE role_permission SET permission = ? WHERE permission = ?',
        [NEW_PERM, OLD_PERM]
      )
      logger.writeInfo('mysql', 'migration', {
        status: 'progress', name: migrationName, permissionRowsUpdated: res.affectedRows
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
      await connection.query(
        'UPDATE role_permission SET permission = ? WHERE permission = ?',
        [OLD_PERM, NEW_PERM]
      )
      await connection.query('ALTER TABLE member RENAME COLUMN scNotes TO confidentialNotes')
      await connection.query(ACTIVE_MEMBER_VIEW)
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  }
}
