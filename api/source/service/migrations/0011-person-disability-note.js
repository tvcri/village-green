const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  `ALTER TABLE person_disability
    ADD COLUMN note VARCHAR(255) NULL AFTER disabilityId`,
]

const downMigration = [
  `ALTER TABLE person_disability
    DROP COLUMN note`,
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => { await migrationHandler.up(pool, __filename) },
  down: async (pool) => { await migrationHandler.down(pool, __filename) },
}
