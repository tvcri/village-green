'use strict'
// Audited-shape registry — the single source of truth for what each
// entityType's audit record contains. See
// scratch/superpowers/specs/2026-08-17-audit-events-design.md §4.
//
// A new column on an audited table is UNAUDITED until declared here (allowlist
// fails safe); a refactor that moves data (e.g. address -> junction) edits the
// entity's declaration, never the audit machinery. Boot-time validation
// (AuditService.validateShapes) checks both directions against the live
// schema, for entity tables AND set-source tables: every declared column
// must exist (drift/stale), and every existing column must appear in
// `columns`/`excluded` (entities) or `sourceColumns` (sets) — so adding a
// column to any audited or folded table without deciding its audit status
// fails the boot, not the trail. `excluded` is the deliberate-omission
// list; the entity id column is covered structurally and never listed.

const shapes = {
  person: {
    table: 'person',
    columns: [
      { name: 'village', expr: '(SELECT name FROM village WHERE village.id = t.villageId)' },
      'lastName', 'firstName', 'middleInitial', 'salutation', 'nickname',
      'street', 'unit', 'city', 'state', 'zip', 'town',
      'email', 'emailStatus', 'phone', 'cell', 'computerUse', 'smartphone',
      { name: 'birthDate', expr: "DATE_FORMAT(t.birthDate, '%Y-%m-%d')" },
      'emergencyContactName', 'emergencyContactRelationship',
      'emergencyContactPhone', 'emergencyContactEmail', 'comments',
    ],
    redacted: [],
    // villageId feeds the 'village' lookup expr; fullName/address are
    // DB-generated composites of audited columns.
    excluded: ['villageId', 'fullName', 'address'],
    // enrollment_request/fcv_submission reference person but are their own
    // records, not attributes of the person — deliberately not folded.
    relatedTables: ['enrollment_request', 'fcv_submission'],
    sets: {
      communities: {
        kind: 'values',
        table: 'person_community',
        sourceColumns: ['id', 'personId', 'communityId'],
        sql: `SELECT c.name AS label
              FROM person_community pc JOIN community c ON c.id = pc.communityId
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
    columns: [
      'personId', 'memberNumber', 'memberLevel', 'memberType', 'primaryPersonId',
      'secondaryType', 'serviceNotes',
      { name: 'joinDate', expr: "DATE_FORMAT(t.joinDate, '%Y-%m-%d')" },
      'status', 'dropReason', 'householdSize', 'householdDues', 'quickbooksKey',
      'printedNewsletter', 'confidentialNotes', 'statusChangeNotes', 'miscNotes',
    ],
    // householdDues + confidentialNotes are the two member fields classified
    // sensitive; diffs record {changed:true}, snapshots record '[redacted]'.
    redacted: ['confidentialNotes', 'householdDues'],
    // createdDate is set-once creation metadata.
    excluded: ['createdDate'],
    relatedTables: [],
    sets: {},
  },

  volunteer: {
    table: 'volunteer',
    columns: ['personId', 'providerType', 'active', 'notes'],
    redacted: [],
    excluded: [],
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
        // additionalData/notes exist but are not rendered into diffs (they
        // are also dropped by replaceVettings — pre-existing, see plan).
        sourceColumns: ['id', 'volunteerId', 'vettingTypeId', 'dateEntered', 'dateExpired', 'additionalData', 'notes'],
        // Natural key mirrors UNIQUE(volunteerId, vettingTypeId, dateEntered)
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
    columns: ['username', 'status'],
    redacted: [],
    // Per-request noise (lastAccess/lastClaims/webPreferences) and
    // status-change attribution metadata (created/statusDate/statusUser).
    excluded: ['created', 'lastAccess', 'lastClaims', 'statusDate', 'statusUser', 'webPreferences'],
    // privacy_acknowledgement/privacy_rules are their own records; user_group's
    // FKs are creation/modification attribution, not user attributes.
    relatedTables: ['privacy_acknowledgement', 'privacy_rules', 'user_group'],
    sets: {
      grants: {
        kind: 'values',
        table: 'role_grant',
        // villageKey is a generated dedup column; userGroupId rows belong to
        // groups (not folded in v1) but the column itself is accounted here.
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
    columns: [
      'requestNumber',
      { name: 'village', expr: '(SELECT name FROM village WHERE village.id = t.villageId)' },
      'memberPersonId', 'volunteerPersonId', 'status', 'serviceName', 'transportationType',
      { name: 'serviceDate', expr: "DATE_FORMAT(t.serviceDate, '%Y-%m-%d')" },
      'timesFlexible', 'startTime', 'finishTime', 'apptTime', 'returnTime',
      'instructions', 'description', 'destination', 'address', 'city', 'phone',
      'state', 'zip', 'start', 'startAddress', 'startCity', 'startState',
      'startZip', 'startPhone',
    ],
    redacted: [],
    // villageId feeds the 'village' expr; createdAt/createdUserId are
    // creation metadata. modifiedUserId/modifiedAt carry VSS-only semantics
    // (read them as vssUserId/vssModifiedAt — written solely by VSS
    // sign-up/release); their absence from the audit trail is deliberate.
    excluded: ['villageId', 'createdAt', 'createdUserId', 'modifiedUserId', 'modifiedAt'],
    // notification_event is its own append-only log by design, not folded.
    relatedTables: ['notification_event'],
    sets: {},
  },
}

function assertShapeInvariants (entityType, shape) {
  const fail = (msg) => { throw new Error(`audit shape '${entityType}': ${msg}`) }
  if (!shape.table) fail('missing table')
  const names = (shape.columns ?? []).map(c => (typeof c === 'string' ? c : c.name))
  if (!names.length) fail('no columns declared')
  if (new Set(names).size !== names.length) fail('duplicate column names')
  if (!Array.isArray(shape.redacted)) fail('missing redacted (declare [] if nothing is redacted)')
  for (const r of shape.redacted) {
    if (!names.includes(r)) fail(`redacted '${r}' is not a declared column`)
  }
  if (!Array.isArray(shape.excluded)) fail('missing excluded (declare [] if every column is audited)')
  const idCol = shape.idColumn ?? 'id'
  for (const x of shape.excluded) {
    if (names.includes(x)) fail(`excluded '${x}' is also a declared column`)
    if (x === idCol) fail(`excluded '${x}' is the id column (covered structurally, never listed)`)
  }
  const setTables = []
  for (const [setName, decl] of Object.entries(shape.sets ?? {})) {
    if (names.includes(setName)) fail(`set '${setName}' collides with a column name`)
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
