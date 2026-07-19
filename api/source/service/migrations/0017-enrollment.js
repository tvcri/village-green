const MigrationHandler = require('./lib/MigrationHandler')

// Volunteer enrollment (self-service Keycloak account claim), design spec
// 2026-07-14-volunteer-enrollment-design.md.
// - enrollment_request: PIN verification store. Holds only a bcrypt hash,
//   never the PIN. Non-PIN outcomes (not_found, ineligible_member,
//   kc_unavailable) are audit rows with NULL pinHash/expiresAt.
// - notification_event grows a generic JSON payload and a nullable
//   serviceRequestId so non-SR events (enroll_ineligible) fit the durable
//   queue the sidecar polls.
const upMigration = [
  `CREATE TABLE enrollment_request (
    id INT NOT NULL AUTO_INCREMENT,
    email VARCHAR(200) NOT NULL,
    personId INT NULL,
    pinHash CHAR(60) NULL,
    kind VARCHAR(32) NULL COMMENT 'new | existing_account',
    outcome VARCHAR(32) NOT NULL COMMENT 'pin_sent | superseded | ineligible_member | not_found | kc_unavailable',
    attempts INT NOT NULL DEFAULT 0,
    resetAttempts INT NOT NULL DEFAULT 0,
    expiresAt DATETIME NULL,
    consumedAt DATETIME NULL,
    resetAt DATETIME NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX INDEX_er_email (email),
    CONSTRAINT fk_enrollment_request_person FOREIGN KEY (personId) REFERENCES person (id) ON DELETE SET NULL
  )`,
  `ALTER TABLE notification_event
    ADD COLUMN payload JSON NULL COMMENT 'Event-type-specific data for events not tied to a service request'`,
  `ALTER TABLE notification_event
    DROP FOREIGN KEY fk_email_event_sr`,
  `ALTER TABLE notification_event
    MODIFY COLUMN serviceRequestId INT NULL`,
  `ALTER TABLE notification_event
    ADD CONSTRAINT fk_email_event_sr FOREIGN KEY (serviceRequestId) REFERENCES service_request (id) ON DELETE CASCADE`,
]
const downMigration = [
  `ALTER TABLE notification_event
    DROP FOREIGN KEY fk_email_event_sr`,
  `ALTER TABLE notification_event
    MODIFY COLUMN serviceRequestId INT NOT NULL`,
  `ALTER TABLE notification_event
    ADD CONSTRAINT fk_email_event_sr FOREIGN KEY (serviceRequestId) REFERENCES service_request (id) ON DELETE CASCADE`,
  `ALTER TABLE notification_event
    DROP COLUMN payload`,
  `DROP TABLE enrollment_request`,
]
const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => { await migrationHandler.up(pool, __filename) },
  down: async (pool) => { await migrationHandler.down(pool, __filename) },
}
