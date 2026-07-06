const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  `ALTER TABLE volunteer
    ADD COLUMN notes TEXT NULL AFTER active`,
  `INSERT INTO capability (name)
    SELECT 'Steering Committee' WHERE NOT EXISTS (
      SELECT 1 FROM capability WHERE name = 'Steering Committee'
    )`,
]

const downMigration = [
  `DELETE FROM capability WHERE name = 'Steering Committee'`,
  `ALTER TABLE volunteer
    DROP COLUMN notes`,
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => { await migrationHandler.up(pool, __filename) },
  down: async (pool) => { await migrationHandler.down(pool, __filename) },
}
