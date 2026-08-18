const MigrationHandler = require('./lib/MigrationHandler')

// audit_event — shared, append-only audit trail for domain-object mutations
// (person, member, volunteer, user, serviceRequest; see service/audit/shapes.js
// and scratch/superpowers/specs/2026-08-17-audit-events-design.md).
//
// Deliberate choices:
// - No FK on entityId or userId: audit rows must outlive both the audited row
//   and the acting user; deletion history is the point.
// - entityType/action are free-form strings validated by the code-side
//   registry at boot, not enums: adding an entity type is a code change plus
//   review, never a migration.
// - changes is JSON: {"snapshot": {...}} for create/delete, {"diff": {...}}
//   for update. Rows are never rewritten after insert — each is a truthful
//   record against the schema of its day.
// - createdAt is a UTC event instant (like notification_event.createdAt),
//   not a wall-clock civil value.
const upMigration = [
  `CREATE TABLE audit_event (
    auditId    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    entityType VARCHAR(45) NOT NULL,
    entityId   INT NOT NULL,
    action     VARCHAR(45) NOT NULL,
    userId     INT NOT NULL,
    changes    JSON NOT NULL,
    createdAt  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (auditId),
    KEY idx_entity (entityType, entityId, createdAt),
    KEY idx_actor (userId, createdAt)
  ) ENGINE=InnoDB`,
]

const downMigration = [
  `DROP TABLE audit_event`,
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => { await migrationHandler.up(pool, __filename) },
  down: async (pool) => { await migrationHandler.down(pool, __filename) },
}
