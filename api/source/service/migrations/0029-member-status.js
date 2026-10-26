// api/source/service/migrations/0029-member-status.js
const MigrationHandler = require('./lib/MigrationHandler')

// Member status: a person-level deceased flag and a member drop-reason catalog.
// See scratch/superpowers/specs/2026-10-26-member-status-design.md §4.
//
// D2: death never writes a role status. `person.deceased` is the single source
//     of truth, and the active_* views exclude deceased persons by joining it.
// D5: `member_drop_reason` starts EMPTY and is not a static-data table: staff
//     own the list. "Deceased" is a person flag, not a catalog row.
//
// chk_member_drop_reason_status is one-directional on purpose (a reason only on
// a Dropped row). "Dropped implies a reason" cannot be a CHECK because legacy
// dropped members have none; the service enforces it on write.
//
// member.dropReason (legacy text) stays in the table, untouched by the API.
// The views keep the column list the previous SELECT * views exposed; MySQL
// expands m.* / v.* at creation time.
const upMigration = [
  `ALTER TABLE person
     ADD COLUMN deceased bit(1) NOT NULL DEFAULT b'0' AFTER deceasedDate`,

  `UPDATE person SET deceased = 1 WHERE deceasedDate IS NOT NULL`,

  `ALTER TABLE person
     ADD CONSTRAINT chk_person_deceased_date CHECK (deceasedDate IS NULL OR deceased = 1)`,

  `CREATE TABLE member_drop_reason (
    id          int NOT NULL AUTO_INCREMENT,
    name        varchar(100) NOT NULL,
    description varchar(255) DEFAULT NULL,
    retired     bit(1) NOT NULL DEFAULT b'0',
    PRIMARY KEY (id),
    UNIQUE KEY member_drop_reason_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `ALTER TABLE member
     ADD COLUMN dropReasonId int NULL AFTER dropReason,
     ADD CONSTRAINT member_drop_reason_fk FOREIGN KEY (dropReasonId) REFERENCES member_drop_reason (id),
     ADD CONSTRAINT chk_member_drop_reason_status CHECK (dropReasonId IS NULL OR status = 'Dropped')`,

  `CREATE OR REPLACE VIEW active_member AS
     SELECT m.* FROM member m JOIN person p ON p.id = m.personId
     WHERE m.status = 'Active' AND p.deceased = 0`,

  `CREATE OR REPLACE VIEW active_volunteer AS
     SELECT v.* FROM volunteer v JOIN person p ON p.id = v.personId
     WHERE v.active = 1 AND p.deceased = 0`,
]

const downMigration = [
  `CREATE OR REPLACE VIEW active_member AS SELECT * FROM member WHERE status = 'Active'`,
  `CREATE OR REPLACE VIEW active_volunteer AS SELECT * FROM volunteer WHERE active = 1`,

  `ALTER TABLE member DROP CHECK chk_member_drop_reason_status`,
  `ALTER TABLE member DROP FOREIGN KEY member_drop_reason_fk`,
  `ALTER TABLE member DROP COLUMN dropReasonId`,
  `DROP TABLE member_drop_reason`,

  `ALTER TABLE person DROP CHECK chk_person_deceased_date`,
  `ALTER TABLE person DROP COLUMN deceased`,
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
