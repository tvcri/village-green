const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  `CREATE TABLE IF NOT EXISTS fcv_submission (
  id                  bigint unsigned NOT NULL,
  villageId           int DEFAULT NULL,
  villageName         varchar(200) DEFAULT NULL,
  volunteerPersonId   int DEFAULT NULL,
  rawVolunteerName    varchar(200) DEFAULT NULL,
  fuzzyVolunteerName  varchar(200) DEFAULT NULL,
  memberPersonId      int DEFAULT NULL,
  rawMemberName       varchar(200) DEFAULT NULL,
  fuzzyMemberName     varchar(200) DEFAULT NULL,
  visitDate           date NOT NULL,
  timeSpentMinutes    int NOT NULL,
  contactType         varchar(50) NOT NULL,
  activityTypes       json DEFAULT NULL,
  activityOther       varchar(500) DEFAULT NULL,
  notes               text DEFAULT NULL,
  submittedAt         datetime NOT NULL,
  PRIMARY KEY (id),
  KEY idx_village     (villageId),
  KEY idx_volunteer   (volunteerPersonId),
  KEY idx_member      (memberPersonId),
  CONSTRAINT fk_fcv_village   FOREIGN KEY (villageId)         REFERENCES village (id),
  CONSTRAINT fk_fcv_volunteer FOREIGN KEY (volunteerPersonId) REFERENCES person (id),
  CONSTRAINT fk_fcv_member    FOREIGN KEY (memberPersonId)    REFERENCES person (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
]

const downMigration = [
  `DROP TABLE IF EXISTS fcv_submission`,
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
