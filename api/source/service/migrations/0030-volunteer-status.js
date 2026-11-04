// api/source/service/migrations/0030-volunteer-status.js
const MigrationHandler = require('./lib/MigrationHandler')

// Volunteer status replaces volunteer.active, and volunteers get a drop-reason
// catalog. See scratch/superpowers/specs/2026-10-27-volunteer-status-design.md §4
// (a delta on the member-status design).
//
// V3:  only status = 'Active' means an active volunteer; Pending and Dropped
//      behave identically everywhere except displays.
// V4:  `active` is dropped outright, not retired in steps. It holds nothing
//      that `status` does not: 1 -> Active, anything else -> Dropped.
// V10: status is NOT NULL, default Pending. Pending grants nothing, exactly as
//      a NULL `active` granted nothing before.
//
// volunteer_drop_reason starts EMPTY and is not a static-data table.
// chk_volunteer_drop_reason_status is one-directional (a reason only on a
// Dropped row); "Dropped implies a reason" is a service rule because migrated
// dropped volunteers have none.
const upMigration = [
  `CREATE TABLE volunteer_drop_reason (
    id          int NOT NULL AUTO_INCREMENT,
    name        varchar(100) NOT NULL,
    description varchar(255) DEFAULT NULL,
    retired     bit(1) NOT NULL DEFAULT b'0',
    PRIMARY KEY (id),
    UNIQUE KEY volunteer_drop_reason_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `ALTER TABLE volunteer
     ADD COLUMN status varchar(50) NOT NULL DEFAULT 'Pending' AFTER providerType,
     ADD COLUMN dropReasonId int NULL AFTER status,
     ADD COLUMN statusChangeNotes text NULL AFTER dropReasonId`,

  `UPDATE volunteer SET status = IF(active = 1, 'Active', 'Dropped')`,

  `ALTER TABLE volunteer
     ADD CONSTRAINT volunteer_drop_reason_fk FOREIGN KEY (dropReasonId) REFERENCES volunteer_drop_reason (id),
     ADD CONSTRAINT chk_volunteer_drop_reason_status CHECK (dropReasonId IS NULL OR status = 'Dropped'),
     DROP COLUMN active`,

  // Recreated after the column change: MySQL expands SELECT * at creation.
  `CREATE OR REPLACE VIEW active_volunteer AS
     SELECT v.* FROM volunteer v JOIN person p ON p.id = v.personId
     WHERE v.status = 'Active' AND p.deceased = 0`,
]

// The view is recreated LAST: SELECT * is expanded at creation, so a view
// rebuilt while the new columns still exist would break when they are dropped.
const downMigration = [
  `ALTER TABLE volunteer ADD COLUMN active bit(1) DEFAULT NULL AFTER providerType`,
  `UPDATE volunteer SET active = (status = 'Active')`,
  `ALTER TABLE volunteer DROP CHECK chk_volunteer_drop_reason_status`,
  `ALTER TABLE volunteer DROP FOREIGN KEY volunteer_drop_reason_fk`,
  `ALTER TABLE volunteer
     DROP COLUMN statusChangeNotes,
     DROP COLUMN dropReasonId,
     DROP COLUMN status`,
  `DROP TABLE volunteer_drop_reason`,

  `CREATE OR REPLACE VIEW active_volunteer AS
     SELECT v.* FROM volunteer v JOIN person p ON p.id = v.personId
     WHERE v.active = 1 AND p.deceased = 0`,
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
