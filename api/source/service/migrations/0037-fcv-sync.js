const MigrationHandler = require('./lib/MigrationHandler')

// The JotForm → VG sync (repo tvcri/vg-sync) brings Friendly Calls & Visits
// reports into fcv_submission through the API, as its own service account.
// This migration gives it:
//
// - fcv_submission: the columns the sync keeps (JotForm's updated_at, the
//   names as submitted, the reporting date, how each name matched, the hold
//   and date decision). submittedAt already holds JotForm's created_at, so it
//   is reused rather than duplicated. visitDate, timeSpentMinutes and
//   contactType become nullable: a report with an unreadable value is stored
//   with a hold instead of being refused. The two unused fuzzy* columns go.
// - fcv_name_match: the names staff have matched to a person (or told the
//   sync to ignore), so the answer is given once. villageId 0 means the
//   form's village was unknown; MySQL primary keys cannot hold NULL.
// - fcv_hold: questions only a person can answer. At most one OPEN hold per
//   subjectKey (openKey is NULL once closed, and NULLs never collide in a
//   unique key; the sync_hold pattern from 0033).
// - Role 10, JotForm Sync: exactly the permissions the sync needs. The
//   member and volunteer reads (including _inactive) are there because a
//   person is hidden from a caller who cannot read any of the person's
//   associations, and names must match against everyone. The grant itself is
//   per-install data and is made in the admin UI. Roles are static catalog
//   rows (20-vg-static.sql).
//
// Go-live rule: existing fcv_submission rows are kept. The sync's first full
// pass replaces them in place, by JotForm submission id.
//
// No foreign keys on the new tables, as in 0033: a FK to person would either
// block deleting anyone the sync ever touched or cascade away their history.
const ROLE_ID = 10
const PERMISSIONS = [
  'person:read', 'member:read', 'member:read_inactive',
  'volunteer:read', 'volunteer:read_inactive', 'village:read',
  'fcv_sync:read', 'fcv_sync:write',
]

const upMigration = [
  `ALTER TABLE fcv_submission
     DROP COLUMN fuzzyVolunteerName,
     DROP COLUMN fuzzyMemberName,
     MODIFY visitDate date NULL,
     MODIFY timeSpentMinutes int NULL,
     MODIFY contactType varchar(50) NULL,
     ADD COLUMN jotformUpdatedAt datetime NULL,
     ADD COLUMN volunteerFirst varchar(100) NULL,
     ADD COLUMN volunteerLast varchar(100) NULL,
     ADD COLUMN volunteerEmail varchar(254) NULL,
     ADD COLUMN memberFirst varchar(100) NULL,
     ADD COLUMN memberLast varchar(100) NULL,
     ADD COLUMN reportingTag date NULL,
     ADD COLUMN volunteerMatch varchar(16) NULL,
     ADD COLUMN memberMatch varchar(16) NULL,
     ADD COLUMN held varchar(16) NULL,
     ADD COLUMN dateDecision varchar(8) NULL,
     ADD COLUMN dateDecidedAt datetime(3) NULL,
     ADD COLUMN dateDecidedUserId int NULL,
     ADD KEY idx_held (held)`,

  `CREATE TABLE fcv_name_match (
    role varchar(16) NOT NULL,
    nameKey varchar(200) NOT NULL,
    villageId int NOT NULL DEFAULT 0,
    personId int DEFAULT NULL,
    \`ignore\` tinyint(1) NOT NULL DEFAULT 0,
    createdAt datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
    createdUserId int DEFAULT NULL,
    PRIMARY KEY (role, nameKey, villageId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `CREATE TABLE fcv_hold (
    holdId int NOT NULL AUTO_INCREMENT,
    kind varchar(16) NOT NULL,
    role varchar(16) DEFAULT NULL,
    nameKey varchar(200) DEFAULT NULL,
    villageId int DEFAULT NULL,
    rawName varchar(200) DEFAULT NULL,
    submissionId bigint unsigned DEFAULT NULL,
    detail json DEFAULT NULL,
    state varchar(8) NOT NULL DEFAULT 'open',
    firstSeenAt datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
    lastSeenAt datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
    closedAt datetime(3) DEFAULT NULL,
    subjectKey varchar(255) NOT NULL,
    openKey varchar(255) GENERATED ALWAYS AS (IF(state = 'open', subjectKey, NULL)) STORED,
    PRIMARY KEY (holdId),
    UNIQUE KEY fcv_hold_open (openKey),
    KEY fcv_hold_subject (subjectKey)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `INSERT INTO role (roleId, name, scope, description, isSystem) VALUES (${ROLE_ID}, 'JotForm Sync', 'federation',
    'The JotForm sync service account: reads persons and writes Friendly Calls & Visits reports', 1)`,

  `INSERT INTO role_permission (roleId, permission) VALUES ${PERMISSIONS.map(p => `(${ROLE_ID}, '${p}')`).join(', ')}`
]

// Restoring NOT NULL fails if any report was stored with a missing value; that
// is deliberate, nothing is deleted or invented to make the rollback pass.
const downMigration = [
  `DELETE FROM role_permission WHERE roleId = ${ROLE_ID}`,
  `DELETE FROM role WHERE roleId = ${ROLE_ID}`,
  `DROP TABLE fcv_hold`,
  `DROP TABLE fcv_name_match`,
  `ALTER TABLE fcv_submission
     DROP KEY idx_held,
     DROP COLUMN dateDecidedUserId,
     DROP COLUMN dateDecidedAt,
     DROP COLUMN dateDecision,
     DROP COLUMN held,
     DROP COLUMN memberMatch,
     DROP COLUMN volunteerMatch,
     DROP COLUMN reportingTag,
     DROP COLUMN memberLast,
     DROP COLUMN memberFirst,
     DROP COLUMN volunteerEmail,
     DROP COLUMN volunteerLast,
     DROP COLUMN volunteerFirst,
     DROP COLUMN jotformUpdatedAt,
     MODIFY contactType varchar(50) NOT NULL,
     MODIFY timeSpentMinutes int NOT NULL,
     MODIFY visitDate date NOT NULL,
     ADD COLUMN fuzzyMemberName varchar(200) NULL,
     ADD COLUMN fuzzyVolunteerName varchar(200) NULL`
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => {
    await migrationHandler.up(pool, __filename)
  },
  down: async (pool) => {
    await migrationHandler.down(pool, __filename)
  }
}
