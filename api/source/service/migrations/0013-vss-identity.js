const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  // Unique: a person links to at most one user account. A duplicate link is
  // an identity error we want loud, not silent (see VSS design spec §1).
  `ALTER TABLE user_data
    ADD COLUMN personId INT NULL,
    ADD UNIQUE KEY INDEX_personId (personId),
    ADD CONSTRAINT fk_user_data_person
      FOREIGN KEY (personId) REFERENCES person (id) ON DELETE SET NULL`,
  `ALTER TABLE person
    ADD INDEX INDEX_email (email)`,
  // Attribution for volunteer pickup/release (SR history is out of scope).
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
  `ALTER TABLE user_data
    DROP FOREIGN KEY fk_user_data_person,
    DROP INDEX INDEX_personId,
    DROP COLUMN personId`,
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => { await migrationHandler.up(pool, __filename) },
  down: async (pool) => { await migrationHandler.down(pool, __filename) },
}
