// api/source/service/migrations/0027-person-record.js
const MigrationHandler = require('./lib/MigrationHandler')

// Person Working Group (Chris Daley's "Modeling persons", 2026-07-14, accepted
// 2026-09-02) and Slack guidance of 2026-09-21 (Caroline Dillon, Gabriella
// Laurenzo). See scratch/superpowers/specs/2026-09-21-person-demographics-circles-design.md.
//
//  1. Nullify Circle of Pride only. Gabriella re-ticks by hand. Veteran
//     rows stay (Caroline, 10:43). The deleted rows are the only record of
//     the application-form Pride answers; the pre-merge production dump
//     keeps them for backfills, so no archive table is created here.
//  2. community -> circle (the group's word) with the settled public names.
//     DownCity and OakHill are circles at the same level. INSERT IGNORE so
//     the test harness (empty community table) ends with the same four rows.
//  3. Names: suffix (Jr./III polluted lastName), displayName (the natural
//     "First Last Suffix" form beside the "Last, First, Suffix" sort form), and
//     firstName optional (mononyms) — NULL, never ''. Existing suffixes are
//     moved out of lastName ("Hanley, Jr" -> Hanley + "Jr."), spelled one way:
//     Jr. / Sr. / roman numerals upper-case.
//  4. Vocabularies are lookup tables, never code: gender, ethnicity, race
//     (multi -> junction), contact_method, language (BCP 47 tag, one row
//     per person flagged preferred). isVeteran is a DEMOGRAPHIC fact, not
//     Veteran's Circle participation. deceasedDate suppresses mailings
//     while service history stays intact.
//  5. person_contact replaces the flat emergencyContact* columns — but NOT
//     in this migration: the client still writes the flat columns, so this
//     only creates the table. 0028 (PR two) copies rows in and drops them.
//  6. person_image is a separate table, not a blob on person: the audit
//     service captures every person column on every edit. Schema only.
//  7. person:read_demographics gates gender/ethnicity/race/isVeteran;
//     seeded to Staff (5) exactly as 0026 seeded person:read_birth_date.
//  8. Application answers survive the circle clear (spec
//     2026-09-22-0027-application-answers-design.md). member.application /
//     volunteer.application hold the wizard's extraction envelope — the
//     only record of the member's Pride-join and the volunteer's
//     support-CoP answers. member:/volunteer:read_application gate reads;
//     seeded to Staff, the only role holding every gate the extraction
//     crosses.
//  9. member_circle_preference: "when requesting services, prefer a
//     responder from this circle". Backfilled from both the CE-era
//     miscNotes sentence and the wizard's own "Circle of Pride preferred:
//     Yes" line (composeNotes in importMapping.js — the wizard is live
//     until merge and keeps writing this line). Deliberately NOT
//     person_circle — a preference is not participation.
// 10. isVeteran is seeded ONCE from Veteran's Circle membership: those rows
//     came from the application's veteran question. A one-time seed, NOT a
//     rule that circle membership implies veteran status (see 4).
// "Currie Jr." / "Hanley, Jr" / "Flaherty III": base name, then the suffix.
// [.] rather than \. keeps the pattern free of escapes through both the JS
// template literal and the MySQL string literal.
const SUFFIX_RE = '^(.+?)[ ,]+(jr|sr|ii|iii|iv)[.]?$'

const LOOKUP = name => `CREATE TABLE ${name} (
     id   int NOT NULL AUTO_INCREMENT,
     name varchar(100) NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY name (name)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`

const upMigration = [
  // 1. nullify Circle of Pride only
  `DELETE pc FROM person_community pc
   JOIN community c ON c.id = pc.communityId
   WHERE c.name = 'Pride'`,

  // 2. rename
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

  // 3. names
  `ALTER TABLE person
     MODIFY COLUMN firstName varchar(100) NULL,
     DROP CHECK person_names_non_empty,
     ADD CONSTRAINT person_last_name_non_empty CHECK (lastName <> ''),
     ADD CONSTRAINT person_first_name_not_blank CHECK (firstName IS NULL OR firstName <> ''),
     ADD COLUMN suffix varchar(20) NULL AFTER middleInitial,
     ADD COLUMN displayName varchar(300)
       GENERATED ALWAYS AS (CONCAT_WS(' ', firstName, lastName, suffix)) STORED AFTER fullName`,
  // The inverted "Last, First" form keeps the suffix after the first name
  // ("Currie, Robert, Jr."), as Chicago/MLA invert it; otherwise moving
  // suffixes out of lastName below would drop them from every table.
  `ALTER TABLE person
     MODIFY COLUMN fullName varchar(200)
       GENERATED ALWAYS AS (CONCAT_WS(', ', lastName, firstName, suffix)) STORED`,
  // Move a trailing Jr/Sr/II/III/IV (space- or comma-separated, optional
  // period) out of lastName. suffix is assigned first: MySQL evaluates
  // single-table SET assignments left to right, so lastName must still hold
  // the original value when suffix reads it. fullName/displayName follow.
  `UPDATE person SET
     suffix = CASE LOWER(REGEXP_REPLACE(lastName, '${SUFFIX_RE}', '$2', 1, 0, 'i'))
       WHEN 'jr' THEN 'Jr.'
       WHEN 'sr' THEN 'Sr.'
       ELSE UPPER(REGEXP_REPLACE(lastName, '${SUFFIX_RE}', '$2', 1, 0, 'i'))
     END,
     lastName = REGEXP_REPLACE(lastName, '${SUFFIX_RE}', '$1', 1, 0, 'i')
   WHERE suffix IS NULL AND REGEXP_LIKE(lastName, '${SUFFIX_RE}', 'i')`,

  // 4. vocabularies
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

  // 4. person columns
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

  // 4/5/6. child tables
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

  // 8. application envelopes
  `ALTER TABLE member ADD COLUMN application JSON NULL`,
  `ALTER TABLE volunteer ADD COLUMN application JSON NULL`,
  // active_member is SELECT * and MySQL expands * at creation time — rebuild
  // it or the new column reads NULL through the view. active_volunteer has
  // an explicit column list (0013) and does not need the column.
  `CREATE OR REPLACE VIEW active_member AS SELECT * FROM member WHERE status = 'Active'`,

  // 9. circle service preferences + backfill from both the CE-era sentence
  // and the wizard's own "Circle of Pride preferred: Yes" line
  `CREATE TABLE member_circle_preference (
     id       int NOT NULL AUTO_INCREMENT,
     memberId int NOT NULL,
     circleId int NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY member_circle_preference (memberId, circleId),
     CONSTRAINT mcp_member_fk FOREIGN KEY (memberId) REFERENCES member (id) ON DELETE CASCADE,
     CONSTRAINT mcp_circle_fk FOREIGN KEY (circleId) REFERENCES circle (id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `INSERT INTO member_circle_preference (memberId, circleId)
   SELECT m.id, c.id FROM member m JOIN circle c ON c.name = 'Circle of Pride'
   WHERE m.miscNotes LIKE '%prefer to have a member of the Circle of Pride to respond%'
      OR m.miscNotes LIKE '%Circle of Pride preferred: Yes%'`,

  // 10. one-time isVeteran seed
  `UPDATE person p
     JOIN person_circle pc ON pc.personId = p.id
     JOIN circle c ON c.id = pc.circleId
   SET p.isVeteran = 1
   WHERE c.name = 'Veteran''s Circle' AND p.isVeteran IS NULL`,

  // 7. permissions
  `INSERT IGNORE INTO role_permission (roleId, permission) VALUES
     (5, 'person:read_demographics'),
     (5, 'member:read_application'),
     (5, 'volunteer:read_application')`,
]

const downMigration = [
  `DELETE FROM role_permission WHERE permission IN
     ('person:read_demographics', 'member:read_application', 'volunteer:read_application')`,
  `DROP TABLE IF EXISTS member_circle_preference`,
  `ALTER TABLE volunteer DROP COLUMN application`,
  `ALTER TABLE member DROP COLUMN application`,
  `CREATE OR REPLACE VIEW active_member AS SELECT * FROM member WHERE status = 'Active'`,
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
  // fold suffixes back into lastName before the column goes (original comma
  // spellings like "Hanley, Jr" come back as "Hanley Jr.")
  `UPDATE person SET lastName = CONCAT(lastName, ' ', suffix) WHERE suffix IS NOT NULL`,
  // fullName must stop referencing suffix before the column can be dropped
  `ALTER TABLE person
     MODIFY COLUMN fullName varchar(200)
       GENERATED ALWAYS AS (CONCAT_WS(', ', lastName, firstName)) STORED`,
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
