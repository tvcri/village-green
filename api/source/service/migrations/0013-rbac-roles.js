// api/source/service/migrations/0013-rbac-roles.js
const MigrationHandler = require('./lib/MigrationHandler')

const villageReads = ['person:read', 'member:read', 'volunteer:read', 'sr:read', 'friend:read']
const staffPerms = [
  'person:read', 'person:write', 'person:read_confidential',
  'member:read', 'member:write', 'member:read_financial',
  'volunteer:read', 'volunteer:write',
  'sr:read', 'sr:write', 'friend:read', 'friend:write',
  'village:read', 'village:write',
]
const boardPerms = ['person:read', 'member:read', 'volunteer:read', 'sr:read', 'friend:read', 'village:read']
const scPerms = ['sr:read', 'sr:write', 'person:read', 'member:read', 'volunteer:read', 'village:read', 'friend:read', 'person:read_confidential']

function permValues(roleId, perms) {
  return perms.map(p => `(${roleId}, '${p}')`).join(',\n    ')
}

const upMigration = [
  `CREATE TABLE role (
    roleId int NOT NULL AUTO_INCREMENT,
    name varchar(100) NOT NULL,
    scope enum('federation','village') NOT NULL,
    description varchar(255) DEFAULT NULL,
    isSystem tinyint NOT NULL DEFAULT 0,
    PRIMARY KEY (roleId),
    UNIQUE KEY idx_role_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `CREATE TABLE role_permission (
    roleId int NOT NULL,
    permission varchar(100) NOT NULL,
    PRIMARY KEY (roleId, permission),
    CONSTRAINT fk_role_permission_role FOREIGN KEY (roleId) REFERENCES role (roleId) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `CREATE TABLE role_grant (
    grantId int NOT NULL AUTO_INCREMENT,
    userId int DEFAULT NULL,
    userGroupId int DEFAULT NULL,
    roleId int NOT NULL,
    villageId int DEFAULT NULL,
    villageKey int GENERATED ALWAYS AS (IFNULL(villageId, 0)) VIRTUAL,
    PRIMARY KEY (grantId),
    UNIQUE KEY idx_rg_user (userId, roleId, villageKey),
    UNIQUE KEY idx_rg_group (userGroupId, roleId, villageKey),
    KEY idx_rg_village (villageId, roleId),
    CONSTRAINT fk_role_grant_user FOREIGN KEY (userId) REFERENCES user_data (userId) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_role_grant_group FOREIGN KEY (userGroupId) REFERENCES user_group (userGroupId) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_role_grant_village FOREIGN KEY (villageId) REFERENCES village (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_role_grant_role FOREIGN KEY (roleId) REFERENCES role (roleId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `INSERT INTO role (roleId, name, scope, description, isSystem) VALUES
    (1, 'Local Service Coordinator', 'village', 'Coordinates services within a village', 1),
    (2, 'Steering Committee', 'village', 'Village governance; read access', 1),
    (3, 'Village Lead', 'village', 'Leads a village; read access now, writes planned', 1),
    (4, 'Admin', 'federation', 'Application administrator', 1),
    (5, 'Staff', 'federation', 'Hub staff; full operational read/write', 1),
    (6, 'Board', 'federation', 'Board member; federation-wide redacted visibility', 1),
    (7, 'Service Coordinator', 'federation', 'Federation-wide service request coordination', 1)`,

  `INSERT INTO role_permission (roleId, permission) VALUES
    ${permValues(1, villageReads)},
    ${permValues(2, villageReads)},
    ${permValues(3, villageReads)},
    (4, '*'),
    ${permValues(5, staffPerms)},
    ${permValues(6, boardPerms)},
    ${permValues(7, scPerms)}`,

  // LEAST() folds old Owner (4) into Village Lead (3); 1–3 map 1:1.
  `INSERT INTO role_grant (userId, userGroupId, roleId, villageId)
    SELECT userId, userGroupId, LEAST(roleId, 3), villageId FROM village_grant`,

  // Users whose only "admin" was the JWT realm_access.roles claim (never a
  // village_grant row) get no grant from the copy above. Detect them from
  // their last-seen token claims and seed the federation Admin (roleId 4)
  // grant so they don't lose access post-migration. INSERT IGNORE: safe if
  // a user already holds Admin via some other path (unique key on
  // (userId, roleId, villageKey) would otherwise collide).
  `INSERT IGNORE INTO role_grant (userId, roleId, villageId)
    SELECT userId, 4, NULL FROM user_data
    WHERE JSON_CONTAINS(lastClaims->'$.realm_access.roles', '"admin"')`,

  // Deployment-specific cleanup: on this app's one real deployment, the old
  // way to fake federation-wide access was granting a village-scoped role
  // (Steering Committee, LSC, etc.) on every single village. Any admin-claim
  // user who did this no longer needs those grants once they hold Admin
  // federation-wide (above) - fold them into Staff (real operational access,
  // distinct from Admin's pure escalation role) and drop the redundant
  // per-village rows. Scoped strictly to admin-claim users so it doesn't
  // touch other users who happen to also hold all-village grants for
  // unrelated reasons.
  `INSERT IGNORE INTO role_grant (userId, roleId, villageId)
    SELECT rg.userId, 5, NULL
    FROM role_grant rg
    JOIN role r ON rg.roleId = r.roleId AND r.scope = 'village'
    JOIN user_data ud ON ud.userId = rg.userId
    WHERE JSON_CONTAINS(ud.lastClaims->'$.realm_access.roles', '"admin"')
    GROUP BY rg.userId
    HAVING COUNT(DISTINCT rg.villageId) = (SELECT COUNT(*) FROM village)`,

  `DELETE rg FROM role_grant rg
    JOIN role r ON rg.roleId = r.roleId AND r.scope = 'village'
    JOIN user_data ud ON ud.userId = rg.userId
    WHERE JSON_CONTAINS(ud.lastClaims->'$.realm_access.roles', '"admin"')
      AND rg.userId IN (
        SELECT userId FROM (
          SELECT rg2.userId
          FROM role_grant rg2
          JOIN role r2 ON rg2.roleId = r2.roleId AND r2.scope = 'village'
          GROUP BY rg2.userId
          HAVING COUNT(DISTINCT rg2.villageId) = (SELECT COUNT(*) FROM village)
        ) all_village_holders
      )`,

  `DROP TABLE village_grant`,
]

const downMigration = [
  `CREATE TABLE village_grant (
    grantId int NOT NULL AUTO_INCREMENT,
    villageId int NOT NULL,
    userId int DEFAULT NULL,
    userGroupId int DEFAULT NULL,
    roleId int NOT NULL,
    PRIMARY KEY (grantId),
    UNIQUE KEY INDEX_USER (userId, villageId),
    UNIQUE KEY INDEX_USER_GROUP (userGroupId, villageId),
    KEY INDEX_VILLAGE (villageId, roleId),
    CONSTRAINT fk_village_grant_1 FOREIGN KEY (userId) REFERENCES user_data (userId) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_village_grant_2 FOREIGN KEY (villageId) REFERENCES village (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_village_grant_3 FOREIGN KEY (userGroupId) REFERENCES user_group (userGroupId) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  // Federation grants have no village_grant representation and are dropped.
  // A user with multiple village roles collapses to the highest roleId.
  `INSERT INTO village_grant (userId, userGroupId, roleId, villageId)
    SELECT userId, userGroupId, MAX(roleId), villageId
    FROM role_grant WHERE villageId IS NOT NULL
    GROUP BY userId, userGroupId, villageId`,

  `DROP TABLE role_grant`,
  `DROP TABLE role_permission`,
  `DROP TABLE role`,
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => { await migrationHandler.up(pool, __filename) },
  down: async (pool) => { await migrationHandler.down(pool, __filename) },
}
