const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  `RENAME TABLE email_event TO notification_event`,
  `ALTER TABLE notification_event
    DROP FOREIGN KEY fk_email_event_volunteer,
    DROP COLUMN volunteer_person_id,
    MODIFY COLUMN event_type VARCHAR(32) NOT NULL
      COMMENT 'open | confirmed | cancelled | reminder',
    ADD COLUMN recipients JSON NULL
      COMMENT 'Array of person ids notified, written by sidecar on send',
    ADD COLUMN failed_at TIMESTAMP NULL`,
]

const downMigration = [
  `ALTER TABLE notification_event
    DROP COLUMN IF EXISTS failed_at,
    DROP COLUMN IF EXISTS recipients,
    MODIFY COLUMN event_type VARCHAR(32) NOT NULL,
    ADD COLUMN volunteer_person_id INT NULL,
    ADD CONSTRAINT fk_email_event_volunteer
      FOREIGN KEY (volunteer_person_id) REFERENCES person(id)`,
  `RENAME TABLE notification_event TO email_event`,
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => { await migrationHandler.up(pool, __filename) },
  down: async (pool) => { await migrationHandler.down(pool, __filename) },
}
