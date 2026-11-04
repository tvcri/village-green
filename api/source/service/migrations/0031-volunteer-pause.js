// api/source/service/migrations/0031-volunteer-pause.js
const MigrationHandler = require('./lib/MigrationHandler')

// Volunteer pause: a notification preference on an Active volunteer, not a
// status. See scratch/superpowers/specs/2026-10-27-volunteer-pause-design.md
// §6.1. One rule per volunteer (volunteerId is the primary key); an expired row
// stays until replaced or deleted. No seed rows, not a static-data table.
const upMigration = [
  `CREATE TABLE volunteer_pause (
    volunteerId int NOT NULL,
    startDate date NULL,
    endDate date NULL,
    scope varchar(20) NOT NULL,
    PRIMARY KEY (volunteerId),
    CONSTRAINT volunteer_pause_volunteer_fk FOREIGN KEY (volunteerId)
      REFERENCES volunteer (id) ON DELETE CASCADE,
    CONSTRAINT chk_volunteer_pause_scope CHECK (scope IN ('all','window')),
    CONSTRAINT chk_volunteer_pause_window CHECK (scope <> 'window' OR (startDate IS NOT NULL AND endDate IS NOT NULL)),
    CONSTRAINT chk_volunteer_pause_order CHECK (startDate IS NULL OR endDate IS NULL OR startDate <= endDate)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
]

const downMigration = [
  `DROP TABLE volunteer_pause`,
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
