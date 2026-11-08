const path = require('path')
const logger = require('../../utils/logger')

// Donor as a person association, alongside member and volunteer.
//
// Donors live in LGL (Little Green Light); VG holds them as persons so one
// mailing list can mix donors, members and volunteers. VG keeps no gift
// history: a donor row records the LGL constituent ID (the link back to LGL)
// and the last gift date (staff pick a look-back window against it).
//
// lglConstituentId is required but NOT unique: LGL often records a couple as
// one constituent, and both VG persons carry that constituent's ID. It is
// indexed because the integration looks persons up by it.
//
// There is no status column, so there is no active_donor view.
//
// donor:read is granted to the Staff role. donor:write is granted to no role:
// there is no UI that writes donors, and Admin holds it through the wildcard.
const CREATE_DONOR = `CREATE TABLE donor (
  id int NOT NULL AUTO_INCREMENT,
  personId int NOT NULL,
  lglConstituentId varchar(50) NOT NULL,
  lastGiftDate date DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY donor_person_id (personId),
  KEY donor_lgl_constituent_id (lglConstituentId),
  CONSTRAINT donor_person_fk FOREIGN KEY (personId) REFERENCES person (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`

const PERM = 'donor:read'

module.exports = {
  up: async (pool) => {
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', name: migrationName })
      await connection.query(CREATE_DONOR)
      const [res] = await connection.query(
        "INSERT INTO role_permission (roleId, permission) SELECT roleId, ? FROM role WHERE name = 'Staff'",
        [PERM]
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
      await connection.query("DELETE FROM role_permission WHERE permission IN ('donor:read', 'donor:write')")
      await connection.query('DROP TABLE donor')
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  }
}
