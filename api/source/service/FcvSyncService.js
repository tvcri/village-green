'use strict'
const dbUtils = require('./utils')
const SmError = require('../utils/error')
const AuditService = require('./audit/AuditService')
const { holdSubjectKey, validateSubmission, validateResolution } = require('./fcvSyncRules')

// Storage for the JotForm sync (repo tvcri/vg-sync): Friendly Calls & Visits
// reports, remembered name matches and holds (migration 0037). Like
// SyncService, these writes are not audited: the tables are the sync's own
// records, carry no foreign keys, and the audit layer reads none of them.
//
// Times leave the database as 'YYYY-MM-DD HH:MM:SS' strings (DATE_FORMAT),
// with no time zone conversion, and go in the same way.

const TS = '%Y-%m-%d %H:%i:%s'
const ts = (col) => `DATE_FORMAT(${col}, '${TS}')`
const idStr = (col) => `CAST(${col} AS CHAR)`

const SUBMISSION_COLUMNS = `${idStr('id')} AS id, ${ts('submittedAt')} AS submittedAt,
  ${ts('jotformUpdatedAt')} AS jotformUpdatedAt, ${idStr('villageId')} AS villageId, villageName,
  volunteerFirst, volunteerLast, rawVolunteerName, volunteerEmail, ${idStr('volunteerPersonId')} AS volunteerPersonId,
  volunteerMatch, memberFirst, memberLast, rawMemberName, ${idStr('memberPersonId')} AS memberPersonId, memberMatch,
  DATE_FORMAT(visitDate, '%Y-%m-%d') AS visitDate, timeSpentMinutes, contactType, activityTypes, activityOther, notes,
  DATE_FORMAT(reportingTag, '%Y-%m-%d') AS reportingTag, held, dateDecision`

module.exports.getState = async function () {
  const [[row]] = await dbUtils.pool.query(
    `SELECT DATE_FORMAT(MAX(GREATEST(submittedAt, COALESCE(jotformUpdatedAt, submittedAt))), '${TS}') AS \`cursor\`,
            COUNT(*) AS count
     FROM fcv_submission`)
  return { cursor: row.cursor, count: Number(row.count) }
}

module.exports.getSubmissions = async function () {
  const [rows] = await dbUtils.pool.query(`SELECT ${SUBMISSION_COLUMNS} FROM fcv_submission ORDER BY id`)
  return rows
}

const SUBMISSION_WRITE = [
  'villageId', 'villageName', 'volunteerPersonId', 'rawVolunteerName', 'volunteerFirst', 'volunteerLast',
  'volunteerEmail', 'memberPersonId', 'rawMemberName', 'memberFirst', 'memberLast', 'visitDate', 'timeSpentMinutes',
  'contactType', 'activityTypes', 'activityOther', 'notes', 'reportingTag', 'submittedAt', 'jotformUpdatedAt',
  'volunteerMatch', 'memberMatch', 'held'
]

// Upserts the sync's columns only: dateDecision* are never in the statement.
module.exports.putSubmission = async function (submissionId, body) {
  const row = validateSubmission(body, submissionId)
  if (row.submittedAt === null) throw new SmError.UnprocessableError('submittedAt is required')
  const values = SUBMISSION_WRITE.map(c => c === 'activityTypes' && row[c] !== null ? JSON.stringify(row[c]) : row[c])
  const placeholders = SUBMISSION_WRITE.map(c => c === 'activityTypes' ? 'CAST(? AS JSON)' : '?')
  await dbUtils.pool.query(
    `INSERT INTO fcv_submission (id, ${SUBMISSION_WRITE.join(', ')}) VALUES (?, ${placeholders.join(', ')})
     ON DUPLICATE KEY UPDATE ${SUBMISSION_WRITE.map(c => `${c} = VALUES(${c})`).join(', ')}`,
    [submissionId, ...values])
  const [[stored]] = await dbUtils.pool.query(`SELECT ${SUBMISSION_COLUMNS} FROM fcv_submission WHERE id = ?`, [submissionId])
  return stored
}

module.exports.deleteSubmission = async function (submissionId) {
  const [res] = await dbUtils.pool.query('DELETE FROM fcv_submission WHERE id = ?', [submissionId])
  if (!res.affectedRows) throw new SmError.NotFoundError(`no report ${submissionId}`)
}

module.exports.getNameMatches = async function () {
  const [rows] = await dbUtils.pool.query(
    `SELECT role, nameKey, ${idStr('NULLIF(villageId, 0)')} AS villageId, ${idStr('personId')} AS personId,
            \`ignore\` AS ignored
     FROM fcv_name_match ORDER BY role, nameKey, villageId`)
  return rows.map(({ ignored, ...m }) => ({ ...m, ignore: Boolean(ignored) }))
}

// ---- holds ----

const HOLD_COLUMNS = `${idStr('holdId')} AS holdId, kind, role, nameKey, ${idStr('villageId')} AS villageId, rawName,
  ${idStr('submissionId')} AS submissionId, detail, state, ${ts('firstSeenAt')} AS firstSeenAt,
  ${ts('lastSeenAt')} AS lastSeenAt, ${ts('closedAt')} AS closedAt`

const candidatesOf = (h) => (Array.isArray(h.detail?.candidates) ? h.detail.candidates : [])
  .filter(id => id != null).map(String).filter(id => /^[0-9]{1,10}$/.test(id))

// The persons named in detail.candidates, ids not in VG left out. Base tables,
// not the active_* views: a dropped member is still named.
async function attachPersons (rows) {
  const ids = [...new Set(rows.flatMap(candidatesOf))]
  const byId = new Map()
  if (ids.length) {
    const [people] = await dbUtils.pool.query(
      `SELECT ${idStr('p.id')} AS personId, p.displayName, v.name AS village
       FROM person p LEFT JOIN village v ON v.id = p.villageId WHERE p.id IN (?)`, [ids])
    for (const p of people) byId.set(p.personId, p)
  }
  for (const r of rows) r.persons = [...new Set(candidatesOf(r))].map(id => byId.get(id)).filter(Boolean)
  return rows
}

const holdByIdWith = async (db, holdId) => {
  const [rows] = await db.query(`SELECT ${HOLD_COLUMNS} FROM fcv_hold WHERE holdId = ?`, [holdId])
  return rows.length ? (await attachPersons(rows))[0] : undefined
}

module.exports.getHolds = async function ({ state = 'open' } = {}) {
  const [rows] = await dbUtils.pool.query(
    `SELECT ${HOLD_COLUMNS} FROM fcv_hold WHERE state = ? ORDER BY firstSeenAt DESC, holdId DESC`, [state])
  return attachPersons(rows)
}

// The sync always sends the full set of holds it sees, so the open holds end
// up exactly that set: new subjects open, known ones are refreshed, the rest
// close. An empty list closes every open hold.
module.exports.putHolds = async function (items) {
  const wanted = new Map() // subjectKey -> hold; a later duplicate wins
  for (const h of items) wanted.set(holdSubjectKey(h), h)
  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [open] = await connection.query("SELECT holdId, subjectKey FROM fcv_hold WHERE state = 'open' FOR UPDATE")
      const openByKey = new Map(open.map(r => [r.subjectKey, r.holdId]))
      let opened = 0
      let updated = 0
      for (const [key, h] of wanted) {
        const detail = JSON.stringify(h.detail ?? null)
        if (openByKey.has(key)) {
          await connection.query(
            'UPDATE fcv_hold SET detail = CAST(? AS JSON), rawName = ?, lastSeenAt = NOW(3) WHERE holdId = ?',
            [detail, h.rawName ?? null, openByKey.get(key)])
          updated++
        } else {
          await connection.query(
            `INSERT INTO fcv_hold (kind, role, nameKey, villageId, rawName, submissionId, detail, subjectKey)
             VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)`,
            [h.kind, h.role ?? null, h.nameKey ?? null, h.villageId ?? null, h.rawName ?? null,
              h.submissionId ?? null, detail, key])
          opened++
        }
      }
      const stale = open.filter(r => !wanted.has(r.subjectKey)).map(r => r.holdId)
      if (stale.length) {
        await connection.query("UPDATE fcv_hold SET state = 'closed', closedAt = NOW(3) WHERE holdId IN (?)", [stale])
      }
      return { opened, updated, closed: stale.length }
    },
    statusObj: undefined
  })
}

// Records the answer; the sync carries it out on its next pass and closes the
// hold. A name answer is remembered by (role, nameKey, village, 0 when the
// form's village was unknown); a date answer is stored on the report.
module.exports.resolveHold = async function (holdId, body, userId) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [[hold]] = await connection.query(`SELECT holdId, kind, role, nameKey, villageId, ${idStr('submissionId')} AS submissionId, state
         FROM fcv_hold WHERE holdId = ? FOR UPDATE`, [holdId])
      if (!hold) throw new SmError.NotFoundError(`no hold ${holdId}`)
      if (hold.state !== 'open') throw new SmError.ConflictError('this hold is closed')
      const answer = validateResolution(hold, body)
      let before
      let after
      if (hold.kind === 'name') {
        if (answer.kind === 'match') {
          const [[p]] = await connection.query('SELECT id FROM person WHERE id = ?', [answer.personId])
          if (!p) throw new SmError.UnprocessableError(`no person ${answer.personId}`)
        }
        const villageId = hold.villageId ?? 0
        const [[prior]] = await connection.query(
          `SELECT ${idStr('personId')} AS personId, \`ignore\` AS ignored FROM fcv_name_match
           WHERE role = ? AND nameKey = ? AND villageId = ? FOR UPDATE`, [hold.role, hold.nameKey, villageId])
        await connection.query(
          'REPLACE INTO fcv_name_match (role, nameKey, villageId, personId, `ignore`, createdUserId) VALUES (?, ?, ?, ?, ?, ?)',
          [hold.role, hold.nameKey, villageId, answer.kind === 'match' ? answer.personId : null,
            answer.kind === 'ignore' ? 1 : 0, userId])
        before = { matchPersonId: prior ? prior.personId : null, matchIgnore: prior ? Boolean(prior.ignored) : null }
        after = { matchPersonId: answer.kind === 'match' ? answer.personId : null, matchIgnore: answer.kind === 'ignore' }
      } else {
        const [[prior]] = await connection.query(
          'SELECT dateDecision FROM fcv_submission WHERE id = ? FOR UPDATE', [hold.submissionId])
        if (!prior) throw new SmError.NotFoundError(`no report ${hold.submissionId}`)
        await connection.query(
          'UPDATE fcv_submission SET dateDecision = ?, dateDecidedAt = NOW(3), dateDecidedUserId = ? WHERE id = ?',
          [answer.kind, userId, hold.submissionId])
        before = { dateDecision: prior.dateDecision }
        after = { dateDecision: answer.kind }
      }
      await AuditService.record(connection, { entityType: 'fcvHold', entityId: holdId, action: 'update', userId, before, after })
    },
    statusObj: undefined
  })
  return holdByIdWith(dbUtils.pool, holdId)
}
