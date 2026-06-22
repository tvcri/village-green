const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  `ALTER TABLE service_request ADD COLUMN appt_time DATETIME DEFAULT NULL`,
  `ALTER TABLE service_request ADD COLUMN return_time DATETIME DEFAULT NULL`,
  `ALTER TABLE service_request ADD COLUMN state VARCHAR(50) DEFAULT NULL`,
  `ALTER TABLE service_request ADD COLUMN zip VARCHAR(20) DEFAULT NULL`,
]

const downMigration = [
  `ALTER TABLE service_request DROP COLUMN IF EXISTS appt_time`,
  `ALTER TABLE service_request DROP COLUMN IF EXISTS return_time`,
  `ALTER TABLE service_request DROP COLUMN IF EXISTS state`,
  `ALTER TABLE service_request DROP COLUMN IF EXISTS zip`,
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
