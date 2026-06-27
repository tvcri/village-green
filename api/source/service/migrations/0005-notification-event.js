const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  `RENAME TABLE email_event TO notification_event`,
  // Backfill legacy event_type to the new vocabulary. Old values were
  // new_request/patch_request; the new type derives solely from whether a
  // volunteer was assigned: volunteer -> confirmed, otherwise -> open. This
  // MUST run before volunteer_person_id is dropped below.
  `UPDATE notification_event
    SET event_type = IF(volunteer_person_id IS NOT NULL, 'confirmed', 'open')`,
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
