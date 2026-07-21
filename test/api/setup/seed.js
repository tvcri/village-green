// Seeds the canonical fixtures into the (already-scaffolded) test schema via
// direct parameterized SQL. Idempotent: truncates the relevant tables first so
// `--keep` re-runs start clean. Uses explicit IDs from fixtures.js.
import mysql from 'mysql2/promise'
import { config } from './env.js'
import { villages, users, persons, members, volunteers, serviceRequests, fcvSubmissions } from './fixtures.js'

// Tables we own, child-before-parent for clean truncation.
const TABLES = [
  'enrollment_request',
  'notification_event', 'service_request', 'fcv_submission', 'volunteer_vetting',
  'volunteer_capability', 'volunteer_village_associate', 'volunteer', 'member',
  'person_disability', 'person', 'role_grant', 'user_group_user_map',
  'user_group', 'privacy_acknowledgement', 'privacy_rules', 'user_data', 'village',
]

// Drift tripwire: every column the INSERTs below reference, per table. Checked
// against information_schema before seeding so schema churn on main fails with a
// named column instead of a mid-seed MySQL error. Update alongside the INSERTs.
const EXPECTED_COLUMNS = {
  village: ['id', 'name'],
  user_data: ['userId', 'username'],
  role_grant: ['villageId', 'userId', 'roleId'],
  role: ['roleId', 'name', 'scope'],
  role_permission: ['roleId', 'permission'],
  person: ['id', 'villageId', 'firstName', 'lastName', 'street', 'city', 'state', 'zip', 'email', 'phone', 'cell'],
  member: ['id', 'personId', 'memberNumber', 'status'],
  volunteer: ['id', 'personId', 'active'],
  service_request: ['id', 'requestNumber', 'villageId', 'memberPersonId', 'volunteerPersonId',
    'status', 'serviceName', 'destination', 'createdAt', 'serviceDate', 'finishTime'],
  fcv_submission: ['id', 'villageId', 'volunteerPersonId', 'memberPersonId', 'visitDate',
    'timeSpentMinutes', 'contactType', 'activityTypes', 'notes', 'submittedAt'],
}

// The role catalog (role / role_permission) comes from the fresh-scaffold dump
// sql/current/20-vg-static.sql, which carries migration 0013-rbac-roles.js's
// static rows (fixed in #69 — the dump previously marked 0013 executed while
// shipping none of its rows, and this file mirrored the catalog to compensate).
// Do NOT re-introduce that mirror: a second copy of the authorization rules
// would silently rot out of sync with 0013.
async function assertRoleCatalog (conn) {
  const [[{ roles }]] = await conn.query('SELECT COUNT(*) roles FROM role')
  const [[{ perms }]] = await conn.query('SELECT COUNT(*) perms FROM role_permission')
  if (!roles || !perms) {
    throw new Error(
      `the scaffolded schema has an empty role catalog (role=${roles}, role_permission=${perms}) — ` +
      'every role_grant insert would hit fk_role_grant_role. Regenerate ' +
      'sql/current/20-vg-static.sql (generateSchema.sh --container) from a DB ' +
      'migrated through 0013-rbac-roles.js.',
    )
  }
}

async function assertSeedColumns (conn) {
  const [rows] = await conn.query(
    'SELECT TABLE_NAME t, COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?',
    [config.db.schema],
  )
  const have = new Map()
  for (const { t, c } of rows) {
    if (!have.has(t)) have.set(t, new Set())
    have.get(t).add(c)
  }
  const missing = []
  for (const [table, cols] of Object.entries(EXPECTED_COLUMNS)) {
    const actual = have.get(table)
    if (!actual) { missing.push(`table \`${table}\``); continue }
    for (const col of cols) if (!actual.has(col)) missing.push(`${table}.${col}`)
  }
  if (missing.length) {
    throw new Error(
      `seed fixtures are out of sync with the schema — missing: ${missing.join(', ')}. ` +
      'Update setup/seed.js (and fixtures.js) to match api/source/service/migrations/sql/current/.',
    )
  }
}

export async function seed () {
  const conn = await mysql.createConnection({
    host: config.db.host, port: config.db.port,
    user: config.db.user, password: config.db.password, database: config.db.schema,
    multipleStatements: false,
  })
  try {
    await assertSeedColumns(conn)
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const t of TABLES) {
      // Some tables only exist after certain migrations; tolerate absence.
      try { await conn.query(`TRUNCATE TABLE \`${t}\``) } catch (e) {
        if (e.code !== 'ER_NO_SUCH_TABLE') throw e
      }
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1')

    // After truncation: `role`/`role_permission` are NOT in TABLES (the catalog
    // is scaffold-provided static data), so this asserts what actually survives
    // into the seeding phase, where the role_grant FKs resolve against it.
    await assertRoleCatalog(conn)

    for (const v of Object.values(villages)) {
      await conn.query('INSERT INTO village (id, name) VALUES (?, ?)', [v.id, v.name])
    }

    for (const u of Object.values(users)) {
      await conn.query('INSERT INTO user_data (userId, username) VALUES (?, ?)', [u.userId, u.username])
      for (const g of u.grants) {
        // villageId null = federation-scoped grant (Admin/Staff/Board/SC roles)
        await conn.query(
          'INSERT INTO role_grant (villageId, userId, roleId) VALUES (?, ?, ?)',
          [g.villageId ?? null, u.userId, g.roleId],
        )
      }
    }

    for (const p of Object.values(persons)) {
      // person.address (street + unit) and person.fullName ("last, first") are
      // generated columns; seed street/firstName/lastName.
      await conn.query(
        `INSERT INTO person (id, villageId, firstName, lastName, street, city, state, zip, email, phone, cell)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.villageId, p.firstName, p.lastName, p.street, p.city, p.state, p.zip, p.email, p.phone, p.cell],
      )
    }

    for (const m of Object.values(members)) {
      await conn.query(
        'INSERT INTO member (id, personId, memberNumber, status) VALUES (?, ?, ?, ?)',
        [m.id, m.personId, m.memberNumber, m.status],
      )
    }

    for (const vol of Object.values(volunteers)) {
      await conn.query('INSERT INTO volunteer (id, personId, active) VALUES (?, ?, ?)', [vol.id, vol.personId, vol.active])
    }

    for (const sr of Object.values(serviceRequests)) {
      await conn.query(
        `INSERT INTO service_request
           (id, requestNumber, villageId, memberPersonId, volunteerPersonId,
            status, serviceName, destination, createdAt, serviceDate, finishTime)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
        [sr.id, sr.requestNumber, sr.villageId, sr.memberPersonId, sr.volunteerPersonId,
          sr.status, sr.serviceName, sr.destination, sr.serviceDate, sr.finishTime],
      )
    }

    for (const f of Object.values(fcvSubmissions)) {
      await conn.query(
        `INSERT INTO fcv_submission
           (id, villageId, volunteerPersonId, memberPersonId, visitDate, timeSpentMinutes,
            contactType, activityTypes, notes, submittedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)`,
        [f.id, f.villageId, f.volunteerPersonId, f.memberPersonId, f.visitDate, f.timeSpentMinutes,
          f.contactType, JSON.stringify(f.activityTypes), f.notes, f.submittedAt],
      )
    }
  } finally {
    await conn.end()
  }
}
