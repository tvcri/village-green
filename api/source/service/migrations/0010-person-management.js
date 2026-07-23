const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  // Person becomes a global identity: home village is optional.
  `ALTER TABLE person MODIFY COLUMN villageId int DEFAULT NULL`,
  // Name collisions are natural; dedup moves to a soft UX concern. The
  // (villageId, fullName) unique index also backs the villageId foreign
  // key, so the FK must be dropped before the index can go, then re-added
  // (MySQL auto-creates a plain index on villageId for the re-added FK).
  `ALTER TABLE person DROP FOREIGN KEY person_ibfk_1`,
  `ALTER TABLE person DROP INDEX village_id`,
  `ALTER TABLE person ADD CONSTRAINT person_ibfk_1
     FOREIGN KEY (villageId) REFERENCES village (id)`,

  // The app now OWNS person data (was read-only). A person requires both a
  // last and first name, so enforce NOT NULL + non-empty at the schema level.
  // (All existing rows already satisfy this.)
  `ALTER TABLE person MODIFY COLUMN lastName  VARCHAR(100) NOT NULL`,
  `ALTER TABLE person MODIFY COLUMN firstName VARCHAR(100) NOT NULL`,
  `ALTER TABLE person
     ADD CONSTRAINT person_names_non_empty
     CHECK (lastName <> '' AND firstName <> '')`,

  // fullName is a read convenience derived from last/first — a STORED
  // generated column so it can never drift and is not directly writable.
  // Because last/first are now NOT NULL and non-empty, no NULLIF guard is
  // needed. The app transitioned from read-only to owning person data.
  `ALTER TABLE person
     MODIFY COLUMN fullName VARCHAR(200)
     GENERATED ALWAYS AS (CONCAT_WS(', ', lastName, firstName)) STORED`,

  // A volunteer's zero-or-more associate villages beyond their home village.
  `CREATE TABLE volunteer_village_associate (
     id          int NOT NULL AUTO_INCREMENT,
     volunteerId int NOT NULL,
     villageId   int NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY volunteer_village (volunteerId, villageId),
     CONSTRAINT vva_volunteer_fk FOREIGN KEY (volunteerId)
       REFERENCES volunteer (id) ON DELETE CASCADE,
     CONSTRAINT vva_village_fk FOREIGN KEY (villageId)
       REFERENCES village (id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  // Community membership (M:N tags). person_community is an association entity
  // (own id PK) so future per-membership property columns can be added.
  `CREATE TABLE community (
     id   int NOT NULL AUTO_INCREMENT,
     name varchar(100) NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY name (name)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `CREATE TABLE person_community (
     id          int NOT NULL AUTO_INCREMENT,
     personId    int NOT NULL,
     communityId int NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY person_community (personId, communityId),
     CONSTRAINT pc_person_fk FOREIGN KEY (personId)
       REFERENCES person (id) ON DELETE CASCADE,
     CONSTRAINT pc_community_fk FOREIGN KEY (communityId)
       REFERENCES community (id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `INSERT INTO community (name) VALUES ('Pride'), ('Veteran')`,

  // Boolean-intent columns are BIT(1), not tinyint(1). mysql2 reads/writes
  // BIT(1) as a JS boolean via the pool's existing typeCast; JSON_OBJECT()
  // embedding still requires an explicit `!= 0` cast regardless of column
  // type (see PersonService.js memberDetail).
  `ALTER TABLE person MODIFY COLUMN computerUse BIT(1) DEFAULT NULL`,
  `ALTER TABLE person MODIFY COLUMN smartphone BIT(1) DEFAULT NULL`,
  `ALTER TABLE member MODIFY COLUMN printedNewsletter BIT(1) DEFAULT NULL`,
  `ALTER TABLE volunteer MODIFY COLUMN active BIT(1) DEFAULT NULL`,

  // Views must be re-created to pick up the new column types (SELECT * is
  // resolved at view-creation time, not at query time).
  `CREATE OR REPLACE VIEW active_member AS
     SELECT id, personId, memberNumber, memberLevel, memberType,
       primaryPersonId, secondaryType, serviceNotes, joinDate, createdDate,
       status, dropReason, householdSize, householdDues, quickbooksKey,
       printedNewsletter, confidentialNotes, statusChangeNotes, miscNotes
     FROM member WHERE status = 'Active'`,
  `CREATE OR REPLACE VIEW active_volunteer AS
     SELECT id, personId, providerType, active
     FROM volunteer WHERE active = 1`,
]

const downMigration = [
  // Revert views and columns back to tinyint(1) before the rest of the
  // down-migration runs (reverse of the up-migration's append order).
  `CREATE OR REPLACE VIEW active_volunteer AS
     SELECT id, personId, providerType, active
     FROM volunteer WHERE active = 1`,
  `CREATE OR REPLACE VIEW active_member AS
     SELECT id, personId, memberNumber, memberLevel, memberType,
       primaryPersonId, secondaryType, serviceNotes, joinDate, createdDate,
       status, dropReason, householdSize, householdDues, quickbooksKey,
       printedNewsletter, confidentialNotes, statusChangeNotes, miscNotes
     FROM member WHERE status = 'Active'`,
  `ALTER TABLE volunteer MODIFY COLUMN active tinyint(1) DEFAULT NULL`,
  `ALTER TABLE member MODIFY COLUMN printedNewsletter tinyint(1) DEFAULT NULL`,
  `ALTER TABLE person MODIFY COLUMN smartphone tinyint(1) DEFAULT NULL`,
  `ALTER TABLE person MODIFY COLUMN computerUse tinyint(1) DEFAULT NULL`,

  // Revert fullName to a plain, writable column (preserving current values).
  `ALTER TABLE person
     MODIFY COLUMN fullName VARCHAR(200) NOT NULL`,
  // Revert the name constraints back to the original nullable columns.
  `ALTER TABLE person DROP CHECK person_names_non_empty`,
  `ALTER TABLE person MODIFY COLUMN lastName  VARCHAR(100) DEFAULT NULL`,
  `ALTER TABLE person MODIFY COLUMN firstName VARCHAR(100) DEFAULT NULL`,
  `DROP TABLE IF EXISTS person_community`,
  `DROP TABLE IF EXISTS community`,
  `DROP TABLE IF EXISTS volunteer_village_associate`,
  // Restore the original composite unique index that also backs the FK, then
  // drop the standalone FK and its auto-created index so the schema matches
  // the pre-migration state (FK backed by the composite unique key).
  `ALTER TABLE person ADD UNIQUE KEY village_id (villageId, fullName)`,
  `ALTER TABLE person DROP FOREIGN KEY person_ibfk_1`,
  `ALTER TABLE person DROP INDEX person_ibfk_1`,
  `ALTER TABLE person ADD CONSTRAINT person_ibfk_1
     FOREIGN KEY (villageId) REFERENCES village (id)`,
  `ALTER TABLE person MODIFY COLUMN villageId int NOT NULL`,
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
