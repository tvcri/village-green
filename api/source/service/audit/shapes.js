'use strict'
// Audited-shape registry — the single source of truth for what each
// entityType's audit record contains. See
// scratch/superpowers/specs/2026-08-17-audit-events-design.md §4.
//
// A new column on an audited table is UNAUDITED until declared here (allowlist
// fails safe); a refactor that moves data (e.g. address -> junction) edits the
// entity's declaration, never the audit machinery. Boot-time validation
// (AuditService.validateShapes) checks both directions against the live
// schema: every declared column must exist (drift), and every existing column
// must appear in `columns` or `excluded` (omission) — so adding a table
// column without deciding its audit status fails the boot, not the trail.
// `excluded` is the deliberate-omission list; the id column is covered
// structurally and never listed.

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
    sets: {
      communities: {
        kind: 'values',
        sql: `SELECT c.name AS label
              FROM person_community pc JOIN community c ON c.id = pc.communityId
              WHERE pc.personId = ?`,
      },
      disabilities: {
        kind: 'keyed',
        key: 'k',
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
    sets: {},
  },

  volunteer: {
    table: 'volunteer',
    columns: ['personId', 'providerType', 'active', 'notes'],
    redacted: [],
    excluded: [],
    sets: {
      capabilities: {
        kind: 'values',
        sql: `SELECT c.name AS label
              FROM volunteer_capability vc JOIN capability c ON c.id = vc.capabilityId
              WHERE vc.volunteerId = ?`,
      },
      villageAssociations: {
        kind: 'values',
        sql: `SELECT v.name AS label
              FROM volunteer_village_associate a JOIN village v ON v.id = a.villageId
              WHERE a.volunteerId = ?`,
      },
      vettings: {
        kind: 'keyed',
        key: 'k',
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
    sets: {
      grants: {
        kind: 'values',
        sql: `SELECT CONCAT(r.name, '@', COALESCE(v.name, 'federation')) AS label
              FROM role_grant rg
              JOIN role r ON r.roleId = rg.roleId
              LEFT JOIN village v ON v.id = rg.villageId
              WHERE rg.userId = ?`,
      },
      userGroups: {
        kind: 'values',
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
  for (const [setName, decl] of Object.entries(shape.sets ?? {})) {
    if (names.includes(setName)) fail(`set '${setName}' collides with a column name`)
    if (decl.kind !== 'values' && decl.kind !== 'keyed') fail(`set '${setName}' has unknown kind '${decl.kind}'`)
    if (typeof decl.sql !== 'string' || !decl.sql.includes('?')) fail(`set '${setName}' sql must take one placeholder`)
  }
}

module.exports = { shapes, assertShapeInvariants }
