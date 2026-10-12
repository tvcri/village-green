// api/source/service/migrations/0028-volunteer-trainings-positions.js
const MigrationHandler = require('./lib/MigrationHandler')

// Volunteer trainings and positions. See
// scratch/superpowers/specs/2026-10-05-volunteer-trainings-positions-design.md.
//
// Catalogs start EMPTY: staff own both lists (spec D1). The only catalog rows
// created here belong to two moves of existing, misfiled data (D2). Each is
// plain set-based SQL that touches zero rows where the source data is absent
// (fresh install, test harness), so nothing needs a guard:
//  1. Volunteer Training out of vetting (it is a gate to becoming active, not
//     a vetting). Training Program stays a vetting type (D3).
//  2. Steering Committee out of capabilities (it is a village position, not a
//     service capability). The position is created only if someone holds the
//     capability: the scaffold's static capability rows include it, and a
//     fresh install must not get a position nobody created.
//
// `position` is backtick-quoted throughout: POSITION is a built-in function
// name and becomes reserved under IGNORE_SPACE.
//
// No role gets the two catalog permissions: the application administrator
// maintains the lists, and those people hold Admin ('*'). See the UI spec
// (2026-10-06-trainings-positions-ui-design.md §2.2).
//
// position_training: which trainings a position expects before assignment.
// Reminders only; nothing enforces it (UI spec §2.1, D4 reworded).
const upMigration = [
  `CREATE TABLE training (
    id          INT NOT NULL AUTO_INCREMENT,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY training_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `CREATE TABLE \`position\` (
    id          INT NOT NULL AUTO_INCREMENT,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    scope       ENUM('federation','village','circle') NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY position_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  // completedKey: a plain unique index lets NULLs repeat, so map NULL to
  // MySQL's minimum DATE. At most one undated record per volunteer+training.
  `CREATE TABLE volunteer_training (
    id            INT NOT NULL AUTO_INCREMENT,
    volunteerId   INT NOT NULL,
    trainingId    INT NOT NULL,
    completedDate DATE NULL,
    completedKey  DATE GENERATED ALWAYS AS (IFNULL(completedDate, '1000-01-01')) VIRTUAL,
    notes         TEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY volunteer_training_natural (volunteerId, trainingId, completedKey),
    KEY vt_training_fk (trainingId),
    CONSTRAINT vt_volunteer_fk FOREIGN KEY (volunteerId) REFERENCES volunteer (id) ON DELETE CASCADE,
    CONSTRAINT vt_training_fk  FOREIGN KEY (trainingId)  REFERENCES training (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  // villageKey/circleKey follow role_grant.villageKey.
  `CREATE TABLE volunteer_position (
    id          INT NOT NULL AUTO_INCREMENT,
    volunteerId INT NOT NULL,
    positionId  INT NOT NULL,
    villageId   INT NULL,
    circleId    INT NULL,
    villageKey  INT GENERATED ALWAYS AS (IFNULL(villageId, 0)) VIRTUAL,
    circleKey   INT GENERATED ALWAYS AS (IFNULL(circleId, 0)) VIRTUAL,
    PRIMARY KEY (id),
    UNIQUE KEY volunteer_position_natural (volunteerId, positionId, villageKey, circleKey),
    KEY vp_position_fk (positionId),
    KEY vp_village_fk (villageId),
    KEY vp_circle_fk (circleId),
    CONSTRAINT vp_volunteer_fk FOREIGN KEY (volunteerId) REFERENCES volunteer (id) ON DELETE CASCADE,
    CONSTRAINT vp_position_fk  FOREIGN KEY (positionId)  REFERENCES \`position\` (id),
    CONSTRAINT vp_village_fk   FOREIGN KEY (villageId)   REFERENCES village (id),
    CONSTRAINT vp_circle_fk    FOREIGN KEY (circleId)    REFERENCES circle (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `CREATE TABLE position_training (
    positionId INT NOT NULL,
    trainingId INT NOT NULL,
    PRIMARY KEY (positionId, trainingId),
    KEY pt_training_fk (trainingId),
    CONSTRAINT pt_position_fk FOREIGN KEY (positionId) REFERENCES \`position\` (id) ON DELETE CASCADE,
    CONSTRAINT pt_training_fk FOREIGN KEY (trainingId) REFERENCES training (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  // 1. Volunteer Training: vetting -> training
  `INSERT INTO training (name)
     SELECT name FROM vetting_type WHERE name = 'Volunteer Training'`,
  `INSERT INTO volunteer_training (volunteerId, trainingId, completedDate, notes)
     SELECT vv.volunteerId, t.id, vv.dateEntered, NULLIF(vv.notes, '')
     FROM volunteer_vetting vv
     JOIN vetting_type vt ON vt.id = vv.vettingTypeId AND vt.name = 'Volunteer Training'
     JOIN training t      ON t.name = 'Volunteer Training'`,
  `DELETE vv FROM volunteer_vetting vv
     JOIN vetting_type vt ON vt.id = vv.vettingTypeId
     WHERE vt.name = 'Volunteer Training'`,
  `DELETE FROM vetting_type WHERE name = 'Volunteer Training'`,

  // 2. Steering Committee: capability -> village position at the home village
  `INSERT INTO \`position\` (name, scope)
     SELECT DISTINCT c.name, 'village'
     FROM capability c JOIN volunteer_capability vc ON vc.capabilityId = c.id
     WHERE c.name = 'Steering Committee'`,
  `INSERT INTO volunteer_position (volunteerId, positionId, villageId)
     SELECT vc.volunteerId, pos.id, p.villageId
     FROM volunteer_capability vc
     JOIN capability c   ON c.id = vc.capabilityId AND c.name = 'Steering Committee'
     JOIN volunteer v    ON v.id = vc.volunteerId
     JOIN person p       ON p.id = v.personId
     JOIN \`position\` pos ON pos.name = 'Steering Committee'
     WHERE p.villageId IS NOT NULL`,
  `DELETE vc FROM volunteer_capability vc
     JOIN capability c ON c.id = vc.capabilityId
     WHERE c.name = 'Steering Committee'`,
  `DELETE FROM capability WHERE name = 'Steering Committee'`,
]

// Reverses everything. Trainings/positions created after the migration are
// lost, which is acceptable for a rollback (spec §5.3).
const downMigration = [
  `INSERT INTO capability (name)
     SELECT 'Steering Committee' FROM DUAL
     WHERE EXISTS (SELECT 1 FROM \`position\` WHERE name = 'Steering Committee')
       AND NOT EXISTS (SELECT 1 FROM capability WHERE name = 'Steering Committee')`,
  `INSERT IGNORE INTO volunteer_capability (volunteerId, capabilityId)
     SELECT vp.volunteerId, c.id
     FROM volunteer_position vp
     JOIN \`position\` pos ON pos.id = vp.positionId AND pos.name = 'Steering Committee'
     JOIN capability c ON c.name = 'Steering Committee'`,

  `INSERT INTO vetting_type (name)
     SELECT 'Volunteer Training' FROM DUAL
     WHERE EXISTS (SELECT 1 FROM training WHERE name = 'Volunteer Training')
       AND NOT EXISTS (SELECT 1 FROM vetting_type WHERE name = 'Volunteer Training')`,
  `INSERT INTO volunteer_vetting (volunteerId, vettingTypeId, dateEntered, notes)
     SELECT vtr.volunteerId, vt.id, vtr.completedDate, vtr.notes
     FROM volunteer_training vtr
     JOIN training t ON t.id = vtr.trainingId AND t.name = 'Volunteer Training'
     JOIN vetting_type vt ON vt.name = 'Volunteer Training'`,

  `DROP TABLE position_training`,
  `DROP TABLE volunteer_position`,
  `DROP TABLE volunteer_training`,
  `DROP TABLE \`position\``,
  `DROP TABLE training`,
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
