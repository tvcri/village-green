const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  // Person becomes a global identity: home village is optional.
  `ALTER TABLE person MODIFY COLUMN village_id int DEFAULT NULL`,
  // Name collisions are natural; dedup moves to a soft UX concern.
  `ALTER TABLE person DROP INDEX village_id`,

  // A volunteer's zero-or-more associate villages beyond their home village.
  `CREATE TABLE volunteer_village_associate (
     id           int NOT NULL AUTO_INCREMENT,
     volunteer_id int NOT NULL,
     village_id   int NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY volunteer_village (volunteer_id, village_id),
     CONSTRAINT vva_volunteer_fk FOREIGN KEY (volunteer_id)
       REFERENCES volunteer (id) ON DELETE CASCADE,
     CONSTRAINT vva_village_fk FOREIGN KEY (village_id)
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
     id           int NOT NULL AUTO_INCREMENT,
     person_id    int NOT NULL,
     community_id int NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY person_community (person_id, community_id),
     CONSTRAINT pc_person_fk FOREIGN KEY (person_id)
       REFERENCES person (id) ON DELETE CASCADE,
     CONSTRAINT pc_community_fk FOREIGN KEY (community_id)
       REFERENCES community (id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `INSERT INTO community (name) VALUES ('Pride'), ('Veteran')`,
]

const downMigration = [
  `DROP TABLE IF EXISTS person_community`,
  `DROP TABLE IF EXISTS community`,
  `DROP TABLE IF EXISTS volunteer_village_associate`,
  `ALTER TABLE person ADD UNIQUE KEY village_id (village_id, full_name)`,
  `ALTER TABLE person MODIFY COLUMN village_id int NOT NULL`,
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
