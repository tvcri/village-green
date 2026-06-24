const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  // Backfill any existing NULL statuses so the NOT NULL constraint can apply.
  // A request with no volunteer is 'Open'; otherwise treat as 'Confirmed'.
  `UPDATE service_request
     SET status = IF(volunteer_person_id IS NULL, 'Open', 'Confirmed')
   WHERE status IS NULL`,
  `ALTER TABLE service_request MODIFY COLUMN status VARCHAR(50) NOT NULL`,
]

const downMigration = [
  `ALTER TABLE service_request MODIFY COLUMN status VARCHAR(50) DEFAULT NULL`,
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
