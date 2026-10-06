'use strict'
// Audited-shape registry — capture-everything model (simplified 2026-08-19;
// see scratch/superpowers/specs/2026-08-17-audit-events-design.md §4 as-built
// notes).
//
// Every real column on an audited ENTITY table is captured automatically:
// AuditService.readShape SELECTs t.* — a new column is audited the moment it
// exists, with nothing to declare and nothing that can be silently omitted.
// Set-source tables are the one place hand-projection remains (their SQL
// joins catalogs for labels), so each set declares `sourceColumns` and boot
// validation checks its source table both directions — a new junction
// column forces a decision the way an entity column can't need one.
// Civil DATE columns are returned as 'YYYY-MM-DD' strings mechanically (per-
// query dateStrings), never as JS Dates. Sensitivity/noise filtering is a
// read-surface concern (none exists yet — the trail is SQL-only), not a
// write-time one.
//
// What remains in this catalog is only what no machine can derive:
// - `extras`: additive label expressions (lookup FKs resolved to names) —
//   they ride alongside the raw columns, never instead of them, so a stale
//   or missing extra can never hide data. Aliases must not shadow real
//   columns (boot-checked).
// - `sets`: junction/child collections folded into this entity, with the
//   source table named as data (the FK scan reads it), `sourceColumns`
//   accounting for every column on it (boot-checked both directions), and
//   SQL producing the alias the differ reads ('label' for values, `key`
//   for keyed — boot-checked via field metadata).
// - `relatedTables`: tables that reference this entity but are deliberately
//   NOT folded. The boot-time FK scan fails on any referencing table that is
//   neither a set source, an audited entity, nor listed here — a future
//   junction forces a fold-or-acknowledge decision.

const shapes = {
  person: {
    table: 'person',
    extras: [
      { name: 'village', expr: '(SELECT name FROM village WHERE village.id = t.villageId)' },
    ],
    // enrollment_request/fcv_submission reference person but are their own
    // records, not attributes of the person — deliberately not folded.
    // person_image: images carry no history (Chris Daley, Part 4) — deliberately not folded.
    relatedTables: ['enrollment_request', 'fcv_submission', 'person_image'],
    sets: {
      circles: {
        kind: 'values',
        table: 'person_circle',
        sourceColumns: ['id', 'personId', 'circleId'],
        sql: `SELECT c.name AS label
              FROM person_circle pc JOIN circle c ON c.id = pc.circleId
              WHERE pc.personId = ?`,
      },
      races: {
        kind: 'values',
        table: 'person_race',
        sourceColumns: ['id', 'personId', 'raceId'],
        sql: `SELECT r.name AS label
              FROM person_race pr JOIN race r ON r.id = pr.raceId
              WHERE pr.personId = ?`,
      },
      languages: {
        kind: 'keyed',
        key: 'k',
        table: 'person_language',
        sourceColumns: ['id', 'personId', 'languageId', 'isPreferred'],
        sql: `SELECT l.name AS k, pl.isPreferred != 0 AS isPreferred
              FROM person_language pl JOIN language l ON l.id = pl.languageId
              WHERE pl.personId = ?`,
      },
      contacts: {
        kind: 'values',
        table: 'person_contact',
        sourceColumns: ['id', 'personId', 'name', 'relationship', 'phone', 'email', 'isPrimary', 'sequence'],
        // Values, not keyed: name is free text (no uniqueness) and ids regenerate
        // on PATCH, so a keyed diff would collapse duplicate names. The label
        // carries the whole row, so any edit reads as remove + add.
        sql: `SELECT CONCAT_WS(' · ', pc.name, pc.relationship, pc.phone, pc.email,
                               IF(pc.isPrimary, 'primary', NULL)) AS label
              FROM person_contact pc
              WHERE pc.personId = ?`,
      },
      disabilities: {
        kind: 'keyed',
        key: 'k',
        table: 'person_disability',
        sourceColumns: ['id', 'personId', 'disabilityId', 'note'],
        sql: `SELECT d.name AS k, pd.note
              FROM person_disability pd JOIN disability d ON d.id = pd.disabilityId
              WHERE pd.personId = ?`,
      },
    },
  },

  member: {
    table: 'member',
    relatedTables: [],
    sets: {
      circlePreferences: {
        kind: 'values',
        table: 'member_circle_preference',
        sourceColumns: ['id', 'memberId', 'circleId'],
        sql: `SELECT c.name AS label
              FROM member_circle_preference mcp JOIN circle c ON c.id = mcp.circleId
              WHERE mcp.memberId = ?`,
      },
    },
  },

  volunteer: {
    table: 'volunteer',
    relatedTables: [],
    sets: {
      capabilities: {
        kind: 'values',
        table: 'volunteer_capability',
        sourceColumns: ['id', 'volunteerId', 'capabilityId'],
        sql: `SELECT c.name AS label
              FROM volunteer_capability vc JOIN capability c ON c.id = vc.capabilityId
              WHERE vc.volunteerId = ?`,
      },
      villageAssociations: {
        kind: 'values',
        table: 'volunteer_village_associate',
        sourceColumns: ['id', 'volunteerId', 'villageId'],
        sql: `SELECT v.name AS label
              FROM volunteer_village_associate a JOIN village v ON v.id = a.villageId
              WHERE a.volunteerId = ?`,
      },
      vettings: {
        kind: 'keyed',
        key: 'k',
        table: 'volunteer_vetting',
        sourceColumns: ['id', 'volunteerId', 'vettingTypeId', 'dateEntered', 'dateExpired', 'additionalData', 'notes'],
        // Natural key mirrors UNIQUE(volunteerId, vettingTypeId, dateEntered).
        // additionalData/notes are not rendered into diffs.
        sql: `SELECT CONCAT(vt.name, ' ', DATE_FORMAT(vv.dateEntered, '%Y-%m-%d')) AS k,
                     vt.name AS vettingType,
                     DATE_FORMAT(vv.dateEntered, '%Y-%m-%d') AS dateEntered,
                     DATE_FORMAT(vv.dateExpired, '%Y-%m-%d') AS dateExpired
              FROM volunteer_vetting vv JOIN vetting_type vt ON vt.id = vv.vettingTypeId
              WHERE vv.volunteerId = ?`,
      },
      // Repeat completions are separate rows, so the key carries the date.
      trainings: {
        kind: 'keyed',
        key: 'k',
        table: 'volunteer_training',
        sourceColumns: ['id', 'volunteerId', 'trainingId', 'completedDate', 'completedKey', 'notes'],
        sql: `SELECT CONCAT(t.name, ' ', COALESCE(DATE_FORMAT(vt.completedDate, '%Y-%m-%d'), 'undated')) AS k,
                     t.name AS training,
                     DATE_FORMAT(vt.completedDate, '%Y-%m-%d') AS completedDate,
                     vt.notes
              FROM volunteer_training vt JOIN training t ON t.id = vt.trainingId
              WHERE vt.volunteerId = ?`,
      },
      positions: {
        kind: 'values',
        table: 'volunteer_position',
        sourceColumns: ['id', 'volunteerId', 'positionId', 'villageId', 'circleId', 'villageKey', 'circleKey'],
        sql: `SELECT CONCAT(pos.name, COALESCE(CONCAT(' — ', v.name), CONCAT(' — ', c.name), '')) AS label
              FROM volunteer_position vp
              JOIN \`position\` pos ON pos.id = vp.positionId
              LEFT JOIN village v ON v.id = vp.villageId
              LEFT JOIN circle c ON c.id = vp.circleId
              WHERE vp.volunteerId = ?`,
      },
    },
  },

  // Staff-owned catalogs (trainings/positions spec). The volunteer-side
  // junctions are folded into the volunteer shape, not here.
  training: {
    table: 'training',
    relatedTables: ['volunteer_training'],
    sets: {},
  },
  position: {
    table: 'position',
    relatedTables: ['volunteer_position'],
    sets: {},
  },

  user: {
    table: 'user_data',
    idColumn: 'userId',
    // privacy_acknowledgement/privacy_rules are their own records; user_group's
    // FKs are creation/modification attribution, not user attributes.
    relatedTables: ['privacy_acknowledgement', 'privacy_rules', 'user_group'],
    sets: {
      grants: {
        kind: 'values',
        table: 'role_grant',
        sourceColumns: ['grantId', 'userId', 'userGroupId', 'roleId', 'villageId', 'villageKey'],
        sql: `SELECT CONCAT(r.name, '@', COALESCE(v.name, 'federation')) AS label
              FROM role_grant rg
              JOIN role r ON r.roleId = rg.roleId
              LEFT JOIN village v ON v.id = rg.villageId
              WHERE rg.userId = ?`,
      },
      userGroups: {
        kind: 'values',
        table: 'user_group_user_map',
        sourceColumns: ['ugumId', 'userGroupId', 'userId'],
        sql: `SELECT ug.name AS label
              FROM user_group_user_map m JOIN user_group ug ON ug.userGroupId = m.userGroupId
              WHERE m.userId = ?`,
      },
    },
  },

  serviceRequest: {
    table: 'service_request',
    extras: [
      { name: 'village', expr: '(SELECT name FROM village WHERE village.id = t.villageId)' },
    ],
    // notification_event is its own append-only log by design, not folded.
    // NOTE: modifiedUserId/modifiedAt (VSS-only semantics, read as
    // vssUserId/vssModifiedAt) are captured like every other column now;
    // their VSS meaning is documented where they are written.
    relatedTables: ['notification_event'],
    sets: {},
  },
}

function assertShapeInvariants (entityType, shape) {
  const fail = (msg) => { throw new Error(`audit shape '${entityType}': ${msg}`) }
  if (!shape.table) fail('missing table')
  const extraNames = (shape.extras ?? []).map(e => e?.name)
  for (const e of shape.extras ?? []) {
    if (typeof e?.name !== 'string' || !e.name) fail('extras entries need a name')
    if (typeof e?.expr !== 'string' || !e.expr) fail(`extra '${e.name}' needs an expr`)
  }
  if (new Set(extraNames).size !== extraNames.length) fail('duplicate extras names')
  const setTables = []
  for (const [setName, decl] of Object.entries(shape.sets ?? {})) {
    if (extraNames.includes(setName)) fail(`set '${setName}' collides with an extras name`)
    if (decl.kind !== 'values' && decl.kind !== 'keyed') fail(`set '${setName}' has unknown kind '${decl.kind}'`)
    if (decl.kind === 'keyed' && (typeof decl.key !== 'string' || !decl.key)) fail(`keyed set '${setName}' must declare its key alias`)
    if (typeof decl.sql !== 'string' || !decl.sql.includes('?')) fail(`set '${setName}' sql must take one placeholder`)
    if (typeof decl.table !== 'string' || !decl.table) fail(`set '${setName}' must declare its source table (the FK scan reads it)`)
    if (!Array.isArray(decl.sourceColumns) || !decl.sourceColumns.length) fail(`set '${setName}' must declare sourceColumns (the set-level omission check reads them)`)
    setTables.push(decl.table)
  }
  if (!Array.isArray(shape.relatedTables)) fail('missing relatedTables (declare [] if no unfolded tables reference this entity)')
  for (const t of shape.relatedTables) {
    if (setTables.includes(t)) fail(`relatedTables '${t}' is already a declared set source`)
  }
}

module.exports = { shapes, assertShapeInvariants }
