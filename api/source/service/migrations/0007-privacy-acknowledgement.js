const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  `CREATE TABLE privacy_rules (
    id INT NOT NULL AUTO_INCREMENT,
    content MEDIUMTEXT NOT NULL,
    publishedAt DATETIME NOT NULL,
    publishedByUserId INT NOT NULL,
    modifiedAt DATETIME NULL,
    modifiedByUserId INT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_privacy_rules_publisher FOREIGN KEY (publishedByUserId) REFERENCES user_data (userId),
    CONSTRAINT fk_privacy_rules_modifier FOREIGN KEY (modifiedByUserId) REFERENCES user_data (userId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE privacy_acknowledgement (
    id INT NOT NULL AUTO_INCREMENT,
    userId INT NOT NULL,
    rulesId INT NOT NULL,
    acknowledgedAt DATETIME NOT NULL,
    tokenClaims JSON NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_privacy_ack_user FOREIGN KEY (userId) REFERENCES user_data (userId),
    CONSTRAINT fk_privacy_ack_rules FOREIGN KEY (rulesId) REFERENCES privacy_rules (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
]

const downMigration = [
  `DROP TABLE IF EXISTS privacy_acknowledgement`,
  `DROP TABLE IF EXISTS privacy_rules`,
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => { await migrationHandler.up(pool, __filename) },
  down: async (pool) => { await migrationHandler.down(pool, __filename) },
}
