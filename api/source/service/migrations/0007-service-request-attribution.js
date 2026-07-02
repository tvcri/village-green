const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  // Nullable: rows created before this migration (including imported CE-era
  // rows with a request_number) have no user to attribute.
  `ALTER TABLE service_request
    ADD COLUMN created_user_id INT NULL,
    ADD CONSTRAINT fk_service_request_created_user
      FOREIGN KEY (created_user_id) REFERENCES user_data (userId)`,
]

const downMigration = [
  `ALTER TABLE service_request
    DROP FOREIGN KEY fk_service_request_created_user,
    DROP COLUMN created_user_id`,
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
