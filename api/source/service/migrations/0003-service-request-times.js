const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  `ALTER TABLE service_request ADD COLUMN appt_time DATETIME DEFAULT NULL`,
  `ALTER TABLE service_request ADD COLUMN return_time DATETIME DEFAULT NULL`,
  `ALTER TABLE service_request ADD COLUMN state VARCHAR(50) DEFAULT NULL`,
  `ALTER TABLE service_request ADD COLUMN zip VARCHAR(20) DEFAULT NULL`,
  `CREATE TABLE email_event (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_type      VARCHAR(32)     NOT NULL,
    service_request_id INT NOT NULL,
    volunteer_id    INT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at         TIMESTAMP       NULL,
    CONSTRAINT fk_email_event_sr
      FOREIGN KEY (service_request_id) REFERENCES service_request(id),
    CONSTRAINT fk_email_event_volunteer
      FOREIGN KEY (volunteer_id) REFERENCES volunteer(id),
    INDEX idx_email_event_pending (sent_at, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
]

const downMigration = [
  `DROP TABLE IF EXISTS email_event`,
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
