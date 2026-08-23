const MigrationHandler = require('./lib/MigrationHandler')

// Task attribution for system-initiated writes.
//
// The audit_event design (0023) assumed every write has a human actor behind
// it — audit_event.userId is INT NOT NULL. That held while the API was the
// only writer, but evt_auto_complete_service_requests mutates service_request
// on a schedule with no request and no user, so its transitions were invisible
// to the trail.
//
// The fix follows STIG Manager's task-attribution pattern (its migration 0047):
// give the task a REAL user_data row and write its userId like any other
// actor's. The row is found by a stable taskName, never by a hardcoded id —
// the auto-increment value is deployment-specific, and nothing may depend on
// what this install happened to assign.
//
// Deliberate choices:
// - status 'unavailable' rather than a new 'system' enum value: it is
//   literally true (the account cannot log in) and the existing auth gate
//   (utils/auth.js, throws UserUnavailableError) already refuses it with no
//   code change. Expanding the status vocabulary was considered and declined
//   — one row in one deployment does not earn an enum migration, an OAS
//   change, and an auth-gate inversion. Revisit if task users multiply.
// - taskName is a plain nullable column, not an FK: VG has no task table.
//   If a job system ever lands, taskName is the natural join key to it.
// - No unique constraint on taskName: one row per task is a convention the
//   seed establishes, and SELECT ... INTO takes the first match regardless.
//   A UNIQUE index would be defensible; it is omitted to keep the column
//   free of meaning the code does not rely on.
const upMigration = [
  `ALTER TABLE user_data
    ADD COLUMN taskName VARCHAR(45) NULL DEFAULT NULL
      COMMENT 'Names the system task this account acts as; NULL for human users'`,

  // The task's actor row. 'unavailable' keeps it off every login path.
  `INSERT INTO user_data (username, taskName, status)
    VALUES ('_task_auto_complete', 'auto_complete', 'unavailable')`,

  // Recreate the event so it records what it changes.
  //
  // The audit rows are INSERTed BEFORE each UPDATE, selecting the same
  // predicate: UPDATE reports no row ids, so the set has to be captured while
  // it still matches.
  //
  // The whole body runs in an EXPLICIT transaction. MySQL does NOT wrap an
  // event body in one — every statement would otherwise autocommit on its
  // own, and a failure between an INSERT and its UPDATE would leave the trail
  // asserting transitions that never happened. START TRANSACTION/COMMIT gives
  // the trail and the transitions one commit fate, the same guarantee
  // AuditService gives API writes by recording on the caller's connection.
  //
  // The handler rolls back and re-raises: a failed run must leave the data
  // untouched and be loud, never half-applied and silent.
  //
  // The changes JSON matches what service/audit/diff.js produces for a
  // single-column change: {"diff":{"status":{"old":...,"new":...}}}. A
  // status-only diff is the whole truth here — the UPDATEs touch nothing else.
  `DROP EVENT IF EXISTS evt_auto_complete_service_requests`,

  `CREATE EVENT evt_auto_complete_service_requests
    ON SCHEDULE EVERY 1 DAY STARTS '2026-07-07 05:01:00'
    ON COMPLETION NOT PRESERVE ENABLE
  DO BEGIN
    DECLARE v_taskUserId INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;

    SELECT userId INTO v_taskUserId FROM user_data WHERE taskName = 'auto_complete';

    -- No task user row: transition nothing rather than write an unattributed
    -- trail. Silence here is a seeding bug, and losing a day of aging is
    -- recoverable; an audit gap is not.
    IF v_taskUserId IS NOT NULL THEN

      START TRANSACTION;

      INSERT INTO audit_event (entityType, entityId, action, userId, changes)
      SELECT 'serviceRequest', id, 'update', v_taskUserId,
             JSON_OBJECT('diff', JSON_OBJECT('status',
               JSON_OBJECT('old', 'Confirmed', 'new', 'Completed')))
      FROM service_request
      WHERE \`status\` = 'Confirmed' AND serviceDate <= CURDATE() - INTERVAL 1 DAY;

      UPDATE service_request SET \`status\` = 'Completed'
      WHERE \`status\` = 'Confirmed' AND serviceDate <= CURDATE() - INTERVAL 1 DAY;

      INSERT INTO audit_event (entityType, entityId, action, userId, changes)
      SELECT 'serviceRequest', id, 'update', v_taskUserId,
             JSON_OBJECT('diff', JSON_OBJECT('status',
               JSON_OBJECT('old', 'Open', 'new', 'Unmatched')))
      FROM service_request
      WHERE \`status\` = 'Open' AND serviceDate <= CURDATE() - INTERVAL 1 DAY;

      UPDATE service_request SET \`status\` = 'Unmatched'
      WHERE \`status\` = 'Open' AND serviceDate <= CURDATE() - INTERVAL 1 DAY;

      COMMIT;

    END IF;
  END`,
]

const downMigration = [
  // Restore the pre-0024 event verbatim (see 0014).
  `DROP EVENT IF EXISTS evt_auto_complete_service_requests`,

  `CREATE EVENT evt_auto_complete_service_requests
    ON SCHEDULE EVERY 1 DAY STARTS '2026-07-07 05:01:00'
    ON COMPLETION NOT PRESERVE ENABLE
  DO BEGIN
    UPDATE service_request SET \`status\` = 'Completed'
    WHERE \`status\` = 'Confirmed' AND serviceDate <= CURDATE() - INTERVAL 1 DAY;

    UPDATE service_request SET \`status\` = 'Unmatched'
    WHERE \`status\` = 'Open' AND serviceDate <= CURDATE() - INTERVAL 1 DAY;
  END`,

  `DELETE FROM user_data WHERE taskName = 'auto_complete'`,

  `ALTER TABLE user_data DROP COLUMN taskName`,
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => { await migrationHandler.up(pool, __filename) },
  down: async (pool) => { await migrationHandler.down(pool, __filename) },
}
