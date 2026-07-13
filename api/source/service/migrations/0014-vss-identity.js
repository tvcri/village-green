const MigrationHandler = require('./lib/MigrationHandler')

// VSS support schema. The stored user_data.personId link originally created
// here was reversed 2026-07-12 (spec §1-AMENDED): user→person identity is
// resolved at runtime from person.email = user_data.username, so nothing is
// persisted. The email index serves that runtime lookup.
const upMigration = [
  `ALTER TABLE person
    ADD INDEX INDEX_email (email)`,
  // Attribution for volunteer sign-up/release (SR history is out of scope).
  `ALTER TABLE service_request
    ADD COLUMN modifiedUserId INT NULL,
    ADD COLUMN modifiedAt DATETIME NULL,
    ADD CONSTRAINT fk_service_request_modified_user
      FOREIGN KEY (modifiedUserId) REFERENCES user_data (userId)`,
]

const downMigration = [
  `ALTER TABLE service_request
    DROP FOREIGN KEY fk_service_request_modified_user,
    DROP COLUMN modifiedUserId,
    DROP COLUMN modifiedAt`,
  `ALTER TABLE person
    DROP INDEX INDEX_email`,
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => { await migrationHandler.up(pool, __filename) },
  down: async (pool) => { await migrationHandler.down(pool, __filename) },
}
