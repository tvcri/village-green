const path = require('path')
const logger = require('../../utils/logger')

// The LGL ↔ VG sync service (repo tvcri/vg-sync) reaches VG only through the
// API, as its own service account. This migration gives it:
//
// - Role 8, Sync Service: exactly the permissions the sync needs. member:read
//   and volunteer:read are there because a person is hidden from a caller who
//   cannot read any of the person's associations, and matching must see
//   everyone. The grant itself is per-install data and is made in the admin UI.
// - Four tables holding the sync's working state and its record of writes to
//   LGL. Writes to VG are already in audit_event; LGL does not show API writes
//   in its own history, so sync_log is the only record of those.
//
// Records are never deleted: no endpoint deletes from these tables. Holds
// change state, runs are finished, memory rows are overwritten.
//
// No foreign keys, as for audit_event: a FK to person would either block
// deleting anyone the sync ever touched or cascade away their history.
const TABLES = [
  `CREATE TABLE sync_field (
    personId int NOT NULL,
    field varchar(32) NOT NULL,
    lglConstituentId varchar(50) NOT NULL,
    value json DEFAULT NULL,
    lglEntryId varchar(50) DEFAULT NULL,
    agreedAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (personId, field),
    KEY sync_field_constituent (lglConstituentId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  // At most one OPEN hold per subject: openKey is NULL for closed/dismissed
  // rows, and NULLs never collide in a unique key (the role_grant.villageKey
  // pattern for the nullable parts).
  `CREATE TABLE sync_hold (
    holdId int NOT NULL AUTO_INCREMENT,
    lglConstituentId varchar(50) NOT NULL,
    personId int DEFAULT NULL,
    field varchar(32) DEFAULT NULL,
    reason varchar(64) NOT NULL,
    detail json DEFAULT NULL,
    fingerprint varchar(64) NOT NULL,
    state enum('open','closed','dismissed') NOT NULL DEFAULT 'open',
    dismissalKind enum('staff','rule') DEFAULT NULL,
    firstSeenAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    lastSeenAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    closedAt datetime(3) DEFAULT NULL,
    dismissedAt datetime(3) DEFAULT NULL,
    dismissedUserId int DEFAULT NULL,
    note varchar(500) DEFAULT NULL,
    personKey int GENERATED ALWAYS AS (IFNULL(personId, 0)) VIRTUAL,
    fieldKey varchar(32) GENERATED ALWAYS AS (IFNULL(field, '')) VIRTUAL,
    openKey tinyint GENERATED ALWAYS AS (IF(state = 'open', 1, NULL)) VIRTUAL,
    PRIMARY KEY (holdId),
    UNIQUE KEY sync_hold_open (lglConstituentId, personKey, fieldKey, reason, openKey),
    KEY sync_hold_state (state),
    KEY sync_hold_person (personId),
    KEY sync_hold_constituent (lglConstituentId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `CREATE TABLE sync_run (
    runId int NOT NULL AUTO_INCREMENT,
    kind enum('full','vg-check','lgl-check') NOT NULL,
    startedAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    finishedAt datetime(3) DEFAULT NULL,
    result enum('running','ok','failed') NOT NULL DEFAULT 'running',
    switches json NOT NULL,
    imageRevision varchar(64) DEFAULT NULL,
    policyHash varchar(64) DEFAULT NULL,
    counts json DEFAULT NULL,
    lglCursor datetime(3) DEFAULT NULL,
    vgCursor bigint unsigned DEFAULT NULL,
    error varchar(1000) DEFAULT NULL,
    PRIMARY KEY (runId),
    KEY sync_run_kind_started (kind, startedAt),
    KEY sync_run_started (startedAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  // One row per attempted write to LGL. compareCase is the API's `case`
  // (CASE is a reserved word).
  `CREATE TABLE sync_log (
    logId bigint unsigned NOT NULL AUTO_INCREMENT,
    runId int DEFAULT NULL,
    loggedAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    lglConstituentId varchar(50) NOT NULL,
    personId int DEFAULT NULL,
    field varchar(32) DEFAULT NULL,
    compareCase varchar(32) DEFAULT NULL,
    request json NOT NULL,
    lglEntryId varchar(50) DEFAULT NULL,
    oldValue json DEFAULT NULL,
    newValue json DEFAULT NULL,
    outcome varchar(32) NOT NULL,
    responseStatus smallint DEFAULT NULL,
    note varchar(1000) DEFAULT NULL,
    PRIMARY KEY (logId),
    KEY sync_log_person (personId, loggedAt),
    KEY sync_log_constituent (lglConstituentId, loggedAt),
    KEY sync_log_run (runId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
]

const ROLE_ID = 8
const PERMISSIONS = [
  'person:read', 'person:write', 'member:read', 'volunteer:read',
  'donor:read', 'donor:write', 'sync:read', 'sync:write',
]

module.exports = {
  up: async (pool) => {
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', name: migrationName })
      for (const ddl of TABLES) await connection.query(ddl)
      await connection.query(
        `INSERT INTO role (roleId, name, scope, description, isSystem) VALUES (?, 'Sync Service', 'federation',
          'The LGL sync service account: persons, donors and sync records', 1)`,
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
      await connection.query('DROP TABLE sync_log, sync_run, sync_hold, sync_field')
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  }
}
