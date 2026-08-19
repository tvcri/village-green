'use strict'
// Audited-shape registry — capture-everything model (simplified 2026-08-19;
// see scratch/superpowers/specs/2026-08-17-audit-events-design.md §4 as-built
// notes).
//
// Every real column on an audited table is captured automatically:
// AuditService.readShape SELECTs t.* — a new column is audited the moment it
// exists, with nothing to declare and nothing that can be silently omitted.
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
//   source table named as data (the FK scan reads it) and SQL producing the
//   alias the differ reads ('label' for values, `key` for keyed — boot-
//   checked via field metadata).
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
    relatedTables: ['enrollment_request', 'fcv_submission'],
    sets: {
      communities: {
        kind: 'values',
        table: 'person_community',
        sql: `SELECT c.name AS label
              FROM person_community pc JOIN community c ON c.id = pc.communityId
              WHERE pc.personId = ?`,
      },
      disabilities: {
        kind: 'keyed',
        key: 'k',
        table: 'person_disability',
        sql: `SELECT d.name AS k, pd.note
              FROM person_disability pd JOIN disability d ON d.id = pd.disabilityId
              WHERE pd.personId = ?`,
      },
    },
  },

  member: {
    table: 'member',
    relatedTables: [],
    sets: {},
  },

  volunteer: {
    table: 'volunteer',
    relatedTables: [],
    sets: {
      capabilities: {
        kind: 'values',
        table: 'volunteer_capability',
        sql: `SELECT c.name AS label
              FROM volunteer_capability vc JOIN capability c ON c.id = vc.capabilityId
              WHERE vc.volunteerId = ?`,
      },
      villageAssociations: {
        kind: 'values',
        table: 'volunteer_village_associate',
        sql: `SELECT v.name AS label
              FROM volunteer_village_associate a JOIN village v ON v.id = a.villageId
              WHERE a.volunteerId = ?`,
      },
      vettings: {
        kind: 'keyed',
        key: 'k',
        table: 'volunteer_vetting',
        // Natural key mirrors UNIQUE(volunteerId, vettingTypeId, dateEntered).
        // additionalData/notes are not rendered into diffs (they are also
        // dropped by replaceVettings — pre-existing, see plan).
        sql: `SELECT CONCAT(vt.name, ' ', DATE_FORMAT(vv.dateEntered, '%Y-%m-%d')) AS k,
                     vt.name AS vettingType,
                     DATE_FORMAT(vv.dateEntered, '%Y-%m-%d') AS dateEntered,
                     DATE_FORMAT(vv.dateExpired, '%Y-%m-%d') AS dateExpired
              FROM volunteer_vetting vv JOIN vetting_type vt ON vt.id = vv.vettingTypeId
              WHERE vv.volunteerId = ?`,
      },
    },
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
        sql: `SELECT CONCAT(r.name, '@', COALESCE(v.name, 'federation')) AS label
              FROM role_grant rg
              JOIN role r ON r.roleId = rg.roleId
              LEFT JOIN village v ON v.id = rg.villageId
              WHERE rg.userId = ?`,
      },
      userGroups: {
        kind: 'values',
        table: 'user_group_user_map',
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
    setTables.push(decl.table)
  }
  if (!Array.isArray(shape.relatedTables)) fail('missing relatedTables (declare [] if no unfolded tables reference this entity)')
  for (const t of shape.relatedTables) {
    if (setTables.includes(t)) fail(`relatedTables '${t}' is already a declared set source`)
  }
}

module.exports = { shapes, assertShapeInvariants }
