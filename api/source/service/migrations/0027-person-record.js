// api/source/service/migrations/0027-person-record.js
const MigrationHandler = require('./lib/MigrationHandler')

// Person Working Group (Chris Daley's "Modeling persons", 2026-07-14, accepted
// 2026-09-02) and Slack guidance of 2026-09-21 (Caroline Dillon, Gabriella
// Laurenzo). See scratch/superpowers/specs/2026-09-21-person-demographics-circles-design.md.
//
//  1. Snapshot every person↔community row. Those rows are the ONLY record
//     that the application-form circle boxes were ticked; the volunteer
//     form's "support the Circle of Pride" answer exists nowhere else.
//     Per-install data — never in the scaffold, never dropped by down.
//  2. Nullify Circle of Pride only. Gabriella re-ticks by hand. Veteran
//     rows stay (Caroline, 10:43).
//  3. community -> circle (the group's word) with the settled public names.
//     DownCity and OakHill are circles at the same level. INSERT IGNORE so
//     the test harness (empty community table) ends with the same four rows.
//  4. Names: suffix (Jr./III polluted lastName), displayName (the natural
//     "First Last Suffix" form beside the "Last, First" sort form), and
//     firstName optional (mononyms) — NULL, never ''.
//  5. Vocabularies are lookup tables, never code: gender, ethnicity, race
//     (multi -> junction), contact_method, language (BCP 47 tag, one row
//     per person flagged preferred). isVeteran is a DEMOGRAPHIC fact, not
//     Veteran's Circle participation. deceasedDate suppresses mailings
//     while service history stays intact.
//  6. person_contact replaces the flat emergencyContact* columns — but NOT
//     in this migration: the client still writes the flat columns, so this
//     only creates the table. 0028 (PR two) copies rows in and drops them.
//  7. person_image is a separate table, not a blob on person: the audit
//     service captures every person column on every edit. Schema only.
//  8. person:read_demographics gates gender/ethnicity/race/isVeteran;
//     seeded to Staff (5) exactly as 0026 seeded person:read_birth_date.
const LOOKUP = name => `CREATE TABLE ${name} (
     id   int NOT NULL AUTO_INCREMENT,
     name varchar(100) NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY name (name)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`

const upMigration = [
  // 1. snapshot
  `CREATE TABLE person_circle_snapshot AS
   SELECT pc.id, pc.personId, c.name AS circleName, NOW() AS snapshotAt
   FROM person_community pc JOIN community c ON c.id = pc.communityId`,

  // 2. nullify Circle of Pride only
  `DELETE pc FROM person_community pc
   JOIN community c ON c.id = pc.communityId
   WHERE c.name = 'Pride'`,

  // 3. rename
  `RENAME TABLE community TO circle, person_community TO person_circle`,
  `ALTER TABLE person_circle RENAME COLUMN communityId TO circleId`,
  `ALTER TABLE person_circle
     DROP FOREIGN KEY pc_community_fk,
     DROP FOREIGN KEY pc_person_fk`,
  `ALTER TABLE person_circle
     DROP INDEX pc_community_fk,
     DROP INDEX person_community,
     ADD UNIQUE KEY person_circle (personId, circleId),
     ADD CONSTRAINT person_circle_person_fk FOREIGN KEY (personId)
       REFERENCES person (id) ON DELETE CASCADE,
     ADD CONSTRAINT person_circle_circle_fk FOREIGN KEY (circleId)
       REFERENCES circle (id)`,
  `UPDATE circle SET name = 'Circle of Pride' WHERE name = 'Pride'`,
  `UPDATE circle SET name = 'Veteran''s Circle' WHERE name = 'Veteran'`,
  `INSERT IGNORE INTO circle (name) VALUES
     ('Circle of Pride'), ('Veteran''s Circle'), ('DownCity'), ('OakHill')`,

  // 4. names
  `ALTER TABLE person
     MODIFY COLUMN firstName varchar(100) NULL,
     DROP CHECK person_names_non_empty,
     ADD CONSTRAINT person_last_name_non_empty CHECK (lastName <> ''),
     ADD CONSTRAINT person_first_name_not_blank CHECK (firstName IS NULL OR firstName <> ''),
     ADD COLUMN suffix varchar(20) NULL AFTER middleInitial,
     ADD COLUMN displayName varchar(300)
       GENERATED ALWAYS AS (CONCAT_WS(' ', firstName, lastName, suffix)) STORED AFTER fullName`,

  // 5. vocabularies
  LOOKUP('gender'),
  LOOKUP('ethnicity'),
  LOOKUP('race'),
  LOOKUP('contact_method'),
  `CREATE TABLE language (
     id   int NOT NULL AUTO_INCREMENT,
     name varchar(100) NOT NULL,
     tag  varchar(10)  NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY name (name),
     UNIQUE KEY tag (tag)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `INSERT INTO gender (name) VALUES ('Female'), ('Male'), ('Other')`,
  `INSERT INTO ethnicity (name) VALUES ('Hispanic or Latino'), ('Not Hispanic or Latino')`,
  `INSERT INTO race (name) VALUES
     ('American Indian or Alaska Native'), ('Asian'), ('Black or African American'),
     ('Native Hawaiian or Other Pacific Islander'), ('White')`,
  `INSERT INTO contact_method (name) VALUES ('Phone'), ('Cell'), ('Email'), ('Mail')`,
  `INSERT INTO language (name, tag) VALUES
     ('English', 'en'), ('Spanish', 'es'), ('Portuguese', 'pt'), ('Italian', 'it')`,

  // 5. person columns
  `ALTER TABLE person
     ADD COLUMN pronouns varchar(30) NULL AFTER nickname,
     ADD COLUMN genderId int NULL,
     ADD COLUMN ethnicityId int NULL,
     ADD COLUMN isVeteran bit(1) NULL,
     ADD COLUMN deceasedDate date NULL AFTER birthDate,
     ADD COLUMN preferredContactMethodId int NULL,
     ADD CONSTRAINT person_gender_fk FOREIGN KEY (genderId) REFERENCES gender (id),
     ADD CONSTRAINT person_ethnicity_fk FOREIGN KEY (ethnicityId) REFERENCES ethnicity (id),
     ADD CONSTRAINT person_contact_method_fk FOREIGN KEY (preferredContactMethodId) REFERENCES contact_method (id)`,

  // 5/6/7. child tables
  `CREATE TABLE person_race (
     id       int NOT NULL AUTO_INCREMENT,
     personId int NOT NULL,
     raceId   int NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY person_race (personId, raceId),
     CONSTRAINT person_race_person_fk FOREIGN KEY (personId) REFERENCES person (id) ON DELETE CASCADE,
     CONSTRAINT person_race_race_fk   FOREIGN KEY (raceId)   REFERENCES race (id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE person_language (
     id          int NOT NULL AUTO_INCREMENT,
     personId    int NOT NULL,
     languageId  int NOT NULL,
     isPreferred bit(1) NOT NULL DEFAULT b'0',
     PRIMARY KEY (id),
     UNIQUE KEY person_language (personId, languageId),
     CONSTRAINT person_language_person_fk   FOREIGN KEY (personId)   REFERENCES person (id) ON DELETE CASCADE,
     CONSTRAINT person_language_language_fk FOREIGN KEY (languageId) REFERENCES language (id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE person_contact (
     id           int NOT NULL AUTO_INCREMENT,
     personId     int NOT NULL,
     name         varchar(200) NOT NULL,
     relationship varchar(100) NULL,
     phone        varchar(50)  NULL,
     email        varchar(200) NULL,
     isPrimary    bit(1) NOT NULL DEFAULT b'0',
     sequence     tinyint NOT NULL DEFAULT 0,
     PRIMARY KEY (id),
     KEY person_contact_person (personId),
     CONSTRAINT person_contact_person_fk FOREIGN KEY (personId) REFERENCES person (id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE person_image (
     id        int NOT NULL AUTO_INCREMENT,
     personId  int NOT NULL,
     kind      varchar(10) NOT NULL,
     mimeType  varchar(50) NOT NULL,
     width     smallint unsigned NULL,
     height    smallint unsigned NULL,
     bytes     MEDIUMBLOB NOT NULL,
     thumbnail BLOB NULL,
     updatedAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
     PRIMARY KEY (id),
     UNIQUE KEY person_image (personId, kind),
     CONSTRAINT person_image_person_fk FOREIGN KEY (personId) REFERENCES person (id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  // 8. permission
  `INSERT IGNORE INTO role_permission (roleId, permission) VALUES (5, 'person:read_demographics')`,
]

const downMigration = [
  `DELETE FROM role_permission WHERE permission = 'person:read_demographics'`,
  `DROP TABLE IF EXISTS person_image`,
  `DROP TABLE IF EXISTS person_contact`,
  `DROP TABLE IF EXISTS person_language`,
  `DROP TABLE IF EXISTS person_race`,
  `ALTER TABLE person
     DROP FOREIGN KEY person_gender_fk,
     DROP FOREIGN KEY person_ethnicity_fk,
     DROP FOREIGN KEY person_contact_method_fk`,
  `ALTER TABLE person
     DROP COLUMN pronouns,
     DROP COLUMN genderId,
     DROP COLUMN ethnicityId,
     DROP COLUMN isVeteran,
     DROP COLUMN deceasedDate,
     DROP COLUMN preferredContactMethodId`,
  `DROP TABLE IF EXISTS language`,
  `DROP TABLE IF EXISTS contact_method`,
  `DROP TABLE IF EXISTS race`,
  `DROP TABLE IF EXISTS ethnicity`,
  `DROP TABLE IF EXISTS gender`,
  // a NULL firstName cannot be restored faithfully; down is a safety net
  `UPDATE person SET firstName = '-' WHERE firstName IS NULL`,
  `ALTER TABLE person
     DROP COLUMN displayName,
     DROP COLUMN suffix,
     DROP CHECK person_first_name_not_blank,
     DROP CHECK person_last_name_non_empty,
     MODIFY COLUMN firstName varchar(100) NOT NULL,
     ADD CONSTRAINT person_names_non_empty CHECK (lastName <> '' AND firstName <> '')`,
  `DELETE FROM circle WHERE name IN ('DownCity', 'OakHill')`,
  `UPDATE circle SET name = 'Pride'   WHERE name = 'Circle of Pride'`,
  `UPDATE circle SET name = 'Veteran' WHERE name = 'Veteran''s Circle'`,
  `ALTER TABLE person_circle
     DROP FOREIGN KEY person_circle_person_fk,
     DROP FOREIGN KEY person_circle_circle_fk`,
  `ALTER TABLE person_circle
     DROP INDEX person_circle_circle_fk,
     DROP INDEX person_circle,
     ADD UNIQUE KEY person_community (personId, circleId),
     ADD CONSTRAINT pc_person_fk FOREIGN KEY (personId)
       REFERENCES person (id) ON DELETE CASCADE,
     ADD CONSTRAINT pc_community_fk FOREIGN KEY (circleId)
       REFERENCES circle (id)`,
  `ALTER TABLE person_circle RENAME COLUMN circleId TO communityId`,
  `RENAME TABLE circle TO community, person_circle TO person_community`,
  // person_circle_snapshot is deliberately kept.
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
