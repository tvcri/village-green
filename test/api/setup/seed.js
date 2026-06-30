// Seeds the canonical fixtures into the (already-scaffolded) test schema via
// direct parameterized SQL. Idempotent: truncates the relevant tables first so
// `--keep` re-runs start clean. Uses explicit IDs from fixtures.js.
import mysql from 'mysql2/promise'
import { config } from './env.js'
import { villages, users, persons, members, volunteers, serviceRequests, fcvSubmissions } from './fixtures.js'

// Tables we own, child-before-parent for clean truncation.
const TABLES = [
  'notification_event', 'service_request', 'fcv_submission', 'volunteer_vetting',
  'volunteer_capability', 'volunteer', 'member', 'person_disability', 'person',
  'village_grant', 'user_group_user_map', 'user_group', 'user_data', 'village',
]

export async function seed () {
  const conn = await mysql.createConnection({
    host: config.db.host, port: config.db.port,
    user: config.db.user, password: config.db.password, database: config.db.schema,
    multipleStatements: false,
  })
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const t of TABLES) {
      // Some tables (e.g. email_event) only exist after migrations; tolerate absence.
      try { await conn.query(`TRUNCATE TABLE \`${t}\``) } catch (e) {
        if (e.code !== 'ER_NO_SUCH_TABLE') throw e
      }
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1')

    for (const v of Object.values(villages)) {
      await conn.query('INSERT INTO village (id, name) VALUES (?, ?)', [v.id, v.name])
    }

    for (const u of Object.values(users)) {
      await conn.query('INSERT INTO user_data (userId, username) VALUES (?, ?)', [u.userId, u.username])
      for (const g of u.grants) {
        await conn.query(
          'INSERT INTO village_grant (villageId, userId, roleId) VALUES (?, ?, ?)',
          [g.villageId, u.userId, g.roleId],
        )
      }
    }

    for (const p of Object.values(persons)) {
      // person.address is a generated column (street + unit); seed `street`.
      await conn.query(
        `INSERT INTO person (id, village_id, full_name, street, city, state, zip, email, phone, cell)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.villageId, p.fullName, p.street, p.city, p.state, p.zip, p.email, p.phone, p.cell],
      )
    }

    for (const m of Object.values(members)) {
      await conn.query(
        'INSERT INTO member (id, person_id, member_number) VALUES (?, ?, ?)',
        [m.id, m.personId, m.memberNumber],
      )
    }

    for (const vol of Object.values(volunteers)) {
      await conn.query('INSERT INTO volunteer (id, person_id) VALUES (?, ?)', [vol.id, vol.personId])
    }

    for (const sr of Object.values(serviceRequests)) {
      await conn.query(
        `INSERT INTO service_request
           (id, request_number, village_id, member_person_id, volunteer_person_id,
            status, service_name, destination, created_at, finish_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [sr.id, sr.requestNumber, sr.villageId, sr.memberPersonId, sr.volunteerPersonId,
          sr.status, sr.serviceName, sr.destination, sr.finishAt],
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
