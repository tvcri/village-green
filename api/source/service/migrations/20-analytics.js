'use strict'

const MigrationHandler = require('./lib/MigrationHandler')

module.exports = new MigrationHandler(
  // up
  [
    `CREATE TABLE IF NOT EXISTS analytics_events (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      event_type VARCHAR(32) NOT NULL,
      route_name VARCHAR(64),
      path VARCHAR(512),
      event_name VARCHAR(64),
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
    `CREATE INDEX idx_analytics_user_time ON analytics_events (user_id, created_at)`,
    `CREATE INDEX idx_analytics_route_time ON analytics_events (event_type, route_name, created_at)`,
  ],
  // down
  [
    `DROP TABLE IF EXISTS analytics_events`,
  ]
)
