'use strict';
const dbUtils = require('./utils')
const config = require('../utils/config')
const SmError = require('../utils/error')

// Storage and feeds for the vg-sync service (repo tvcri/vg-sync). Nothing
// here deletes: holds change state, runs are finished, memory is overwritten,
// and the LGL write log is append-only.

// mysql2 decodes JSON columns already. Never JSON.parse a JSON column's value
// again: a stored JSON string ("0", "dana@…") would be decoded twice.

// ---- change feed ----

// Audited entities the feed reports, and the table that maps a row id to its
// person (person rows are the person).
const FEED_TABLES = { member: 'member', volunteer: 'volunteer', donor: 'donor' }
const FEED_TYPES = ['person', ...Object.keys(FEED_TABLES)]

// personId for each non-person audit row: the live row if it exists, else the
// personId in any snapshot (create or delete) the trail holds for it.
async function resolvePersonIds (rows) {
  const out = new Map() // `${entityType}:${entityId}` -> personId
  for (const [entityType, table] of Object.entries(FEED_TABLES)) {
    const ids = [...new Set(rows.filter(r => r.entityType === entityType).map(r => r.entityId))]
    if (!ids.length) continue
    const [live] = await dbUtils.pool.query(`SELECT id, personId FROM ${table} WHERE id IN (?)`, [ids])
    for (const r of live) out.set(`${entityType}:${r.id}`, r.personId)
    const missing = ids.filter(id => !out.has(`${entityType}:${id}`))
    if (!missing.length) continue
    const [snaps] = await dbUtils.pool.query(
      `SELECT entityId, CAST(JSON_UNQUOTE(JSON_EXTRACT(changes, '$.snapshot.personId')) AS SIGNED) AS personId
       FROM audit_event
       WHERE entityType = ? AND entityId IN (?) AND JSON_CONTAINS_PATH(changes, 'one', '$.snapshot.personId')`,
      [entityType, missing]
    )
    for (const r of snaps) {
      if (r.personId != null) out.set(`${entityType}:${r.entityId}`, r.personId)
    }
  }
  return out
}

// The cursor must never pass a write that has not committed yet. auditId is
// AUTO_INCREMENT, allocated in order at insert, so every id below a visible
// row is already allocated: a missing one is either an open transaction or a
// rollback. The scan therefore stops at the first gap, unless the row after
// it is older than VG_SYNC_CHANGE_GAP_SECONDS, when the gap is taken for a
// rollback (a write held open that long is treated as never coming).
// Only update rows of the reported types carry their diff's field names; the
// diff values and snapshots are never read.
module.exports.getChanges = async function ({ after, limit }) {
  const [scanned] = await dbUtils.pool.query(
    `SELECT auditId, entityType, entityId, action,
            IF(action = 'update' AND entityType IN (?), JSON_KEYS(changes, '$.diff'), NULL) AS fields,
            createdAt <= NOW(3) - INTERVAL ? SECOND AS stale
     FROM audit_event
     WHERE auditId > ?
     ORDER BY auditId
     LIMIT ?`,
    [FEED_TYPES, config.settings.syncChangeGapSeconds, after, limit + 1]
  )
  let expected = after + 1
  let end = scanned.length
  for (const [i, r] of scanned.entries()) {
    const auditId = Number(r.auditId)
    if (auditId !== expected && !r.stale) { end = i; break }
    expected = auditId + 1
  }
  const visible = scanned.slice(0, end)
  const more = visible.length > limit
  const rows = more ? visible.slice(0, limit) : visible
  const lastAuditId = rows.length ? Number(rows[rows.length - 1].auditId) : after

  const reported = rows.filter(r => FEED_TYPES.includes(r.entityType))
  const personOf = await resolvePersonIds(reported)

  // Map preserves insertion order: persons by first auditId, and within a
  // person, entity types by first appearance.
  const persons = new Map()
  for (const r of reported) {
    const personId = r.entityType === 'person' ? r.entityId : personOf.get(`${r.entityType}:${r.entityId}`)
    if (personId == null) continue
    if (!persons.has(personId)) persons.set(personId, new Map())
    const byType = persons.get(personId)
    if (!byType.has(r.entityType)) byType.set(r.entityType, { actions: [], fields: new Set() })
    const entry = byType.get(r.entityType)
    if (!entry.actions.includes(r.action)) entry.actions.push(r.action)
    for (const f of r.fields ?? []) entry.fields.add(f)
  }

  return {
    lastAuditId,
    more,
    persons: [...persons].map(([personId, byType]) => ({
      personId: String(personId),
      changes: [...byType].map(([entityType, e]) => ({
        entityType, actions: e.actions, fields: [...e.fields].sort(),
      })),
    })),
  }
}

// ---- memory (sync_field) ----

// Entity ids are strings in the API (StringIntId), as everywhere else.
const FIELD_COLUMNS = 'CAST(personId AS CHAR) AS personId, field, lglConstituentId, value, lglEntryId, agreedAt'

module.exports.getFields = async function ({ personIds } = {}) {
  const filter = personIds?.length ? 'WHERE personId IN (?)' : ''
  const [rows] = await dbUtils.pool.query(
    `SELECT ${FIELD_COLUMNS} FROM sync_field ${filter} ORDER BY sync_field.personId, field`,
    personIds?.length ? [personIds] : []
  )
  return rows
}

// One multi-row upsert. A later item for the same key wins: MySQL applies the
// rows in order, so the second updates the first.
module.exports.putFields = async function (items) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      await connection.query(
        `INSERT INTO sync_field (personId, field, lglConstituentId, value, lglEntryId, agreedAt)
         VALUES ${items.map(() => '(?, ?, ?, CAST(? AS JSON), ?, NOW(3))').join(', ')} AS new
         ON DUPLICATE KEY UPDATE lglConstituentId = new.lglConstituentId, value = new.value,
           lglEntryId = new.lglEntryId, agreedAt = new.agreedAt`,
        items.flatMap(i => [i.personId, i.field, i.lglConstituentId, JSON.stringify(i.value ?? null), i.lglEntryId ?? null])
      )
    },
    statusObj: undefined
  })
  return { upserted: items.length }
}

// ---- holds (sync_hold) ----

const HOLD_COLUMNS = `CAST(holdId AS CHAR) AS holdId, lglConstituentId, CAST(personId AS CHAR) AS personId,
  field, reason, detail, fingerprint, state, dismissalKind, firstSeenAt, lastSeenAt, closedAt, dismissedAt,
  CAST(dismissedUserId AS CHAR) AS dismissedUserId, note`
// Runs a write that may hit sync_hold_open, the one-open-hold-per-subject key,
// and turns that collision into a 409 naming the batch item.
async function guardOpenCollision (i, write) {
  try {
    return await write()
  }
  catch (e) {
    if (e.code === 'ER_DUP_ENTRY' && /sync_hold_open/.test(e.message)) {
      throw new SmError.ConflictError(`item ${i}: an open hold for this constituent, person, field and reason already exists`)
    }
    throw e
  }
}

async function holdsByIds (ids) {
  if (!ids.length) return []
  const [rows] = await dbUtils.pool.query(`SELECT ${HOLD_COLUMNS} FROM sync_hold WHERE holdId IN (?)`, [ids])
  const byId = new Map(rows.map(r => [r.holdId, r]))
  return ids.map(id => byId.get(String(id)))
}

module.exports.getHolds = async function ({ states = ['open'], personId, lglConstituentId } = {}) {
  const where = ['state IN (?)']
  const binds = [states]
  if (personId != null) { where.push('personId = ?'); binds.push(personId) }
  if (lglConstituentId != null) { where.push('lglConstituentId = ?'); binds.push(lglConstituentId) }
  const [rows] = await dbUtils.pool.query(
    `SELECT ${HOLD_COLUMNS} FROM sync_hold WHERE ${where.join(' AND ')} ORDER BY sync_hold.holdId`, binds)
  return rows
}

// Items are inserted one at a time so an open-hold collision names its item.
module.exports.createHolds = async function (items, userId) {
  items.forEach((item, i) => {
    const dismissed = item.state === 'dismissed'
    if (dismissed && !item.dismissalKind) {
      throw new SmError.UnprocessableError(`item ${i}: a dismissed hold needs a dismissalKind`)
    }
    if (!dismissed && item.dismissalKind) {
      throw new SmError.UnprocessableError(`item ${i}: dismissalKind is only for a dismissed hold`)
    }
  })
  const ids = await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const created = []
      for (const [i, item] of items.entries()) {
        const dismissed = item.state === 'dismissed'
        const [res] = await guardOpenCollision(i, () => connection.query(
            `INSERT INTO sync_hold (lglConstituentId, personId, field, reason, detail, fingerprint, state,
               dismissalKind, dismissedAt, dismissedUserId, note, firstSeenAt, lastSeenAt)
             VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ${dismissed ? 'NOW(3)' : 'NULL'}, ?, ?, NOW(3), NOW(3))`,
            [item.lglConstituentId, item.personId ?? null, item.field ?? null, item.reason,
              JSON.stringify(item.detail ?? null), item.fingerprint, dismissed ? 'dismissed' : 'open',
              dismissed ? item.dismissalKind : null, dismissed ? userId : null, item.note ?? null]
        ))
        created.push(res.insertId)
      }
      return created
    },
    statusObj: undefined
  })
  return holdsByIds(ids)
}

// Allowed patch transitions: open -> closed, dismissed -> open.
module.exports.patchHolds = async function (items) {
  const updated = await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const ids = items.map(i => i.holdId)
      const [rows] = await connection.query(
        'SELECT holdId, state FROM sync_hold WHERE holdId IN (?) FOR UPDATE', [ids])
      const state = new Map(rows.map(r => [String(r.holdId), r.state]))
      let count = 0
      for (const [i, item] of items.entries()) {
        if (!state.has(String(item.holdId))) throw new SmError.NotFoundError(`item ${i}: no hold ${item.holdId}`)
      }
      for (const [i, item] of items.entries()) {
        const sets = []
        const binds = []
        if (item.seen) sets.push('lastSeenAt = NOW(3)')
        if (item.fingerprint !== undefined) { sets.push('fingerprint = ?'); binds.push(item.fingerprint) }
        if ('detail' in item) { sets.push('detail = CAST(? AS JSON)'); binds.push(JSON.stringify(item.detail ?? null)) }
        if (item.state !== undefined) {
          const from = state.get(String(item.holdId))
          if (item.state === 'closed' && from === 'open') {
            sets.push("state = 'closed'", 'closedAt = NOW(3)')
          }
          else if (item.state === 'open' && from === 'dismissed') {
            sets.push("state = 'open'", 'dismissalKind = NULL', 'dismissedAt = NULL', 'dismissedUserId = NULL', 'note = NULL')
          }
          else {
            throw new SmError.UnprocessableError(`item ${i}: a hold cannot go from ${from} to ${item.state}`)
          }
          state.set(String(item.holdId), item.state)
        }
        if (!sets.length) continue
        await guardOpenCollision(i, () =>
          connection.query(`UPDATE sync_hold SET ${sets.join(', ')} WHERE holdId = ?`, [...binds, item.holdId]))
        count++
      }
      return count
    },
    statusObj: undefined
  })
  return { updated }
}

module.exports.dismissHold = async function (holdId, { dismissalKind, note }, userId) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [[row]] = await connection.query('SELECT state FROM sync_hold WHERE holdId = ? FOR UPDATE', [holdId])
      if (!row) throw new SmError.NotFoundError(`no hold ${holdId}`)
      if (row.state !== 'open') throw new SmError.UnprocessableError(`only an open hold can be dismissed; this one is ${row.state}`)
      await connection.query(
        `UPDATE sync_hold SET state = 'dismissed', dismissalKind = ?, note = ?, dismissedAt = NOW(3), dismissedUserId = ?
         WHERE holdId = ?`, [dismissalKind, note ?? null, userId, holdId])
    },
    statusObj: undefined
  })
  return (await holdsByIds([holdId]))[0]
}

// ---- runs (sync_run) ----

const RUN_COLUMNS = `CAST(runId AS CHAR) AS runId, kind, startedAt, finishedAt, result, switches, imageRevision, policyHash,
  counts, lglCursor, vgCursor, error`

async function runById (runId) {
  const [[row]] = await dbUtils.pool.query(`SELECT ${RUN_COLUMNS} FROM sync_run WHERE runId = ?`, [runId])
  return row
}

module.exports.createRun = async function ({ kind, switches, imageRevision, policyHash }) {
  const [res] = await dbUtils.pool.query(
    `INSERT INTO sync_run (kind, switches, imageRevision, policyHash, startedAt)
     VALUES (?, CAST(? AS JSON), ?, ?, NOW(3))`,
    [kind, JSON.stringify(switches), imageRevision ?? null, policyHash ?? null]
  )
  return runById(res.insertId)
}

module.exports.patchRun = async function (runId, body) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [[row]] = await connection.query('SELECT result FROM sync_run WHERE runId = ? FOR UPDATE', [runId])
      if (!row) throw new SmError.NotFoundError(`no run ${runId}`)
      if (row.result !== 'running') throw new SmError.ConflictError(`run ${runId} is already ${row.result}`)
      const sets = []
      const binds = []
      // A result ends the run, so it always comes with finishedAt.
      if (body.result !== undefined) { sets.push('result = ?', 'finishedAt = NOW(3)'); binds.push(body.result) }
      if (body.counts !== undefined) { sets.push('counts = CAST(? AS JSON)'); binds.push(JSON.stringify(body.counts)) }
      if (body.lglCursor !== undefined) { sets.push('lglCursor = ?'); binds.push(body.lglCursor === null ? null : new Date(body.lglCursor)) }
      if (body.vgCursor !== undefined) { sets.push('vgCursor = ?'); binds.push(body.vgCursor) }
      if (body.error !== undefined) { sets.push('error = ?'); binds.push(body.error) }
      if (sets.length) await connection.query(`UPDATE sync_run SET ${sets.join(', ')} WHERE runId = ?`, [...binds, runId])
    },
    statusObj: undefined
  })
  return runById(runId)
}

module.exports.getRuns = async function ({ kinds, since, limit = 50 } = {}) {
  const where = []
  const binds = []
  if (kinds?.length) { where.push('kind IN (?)'); binds.push(kinds) }
  if (since) { where.push('startedAt >= ?'); binds.push(new Date(since)) }
  const [rows] = await dbUtils.pool.query(
    `SELECT ${RUN_COLUMNS} FROM sync_run ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY sync_run.runId DESC LIMIT ?`, [...binds, limit])
  return rows
}

// ---- the record of writes to LGL (sync_log) ----

// compareCase in SQL (CASE is reserved), `case` in the API.
const LOG_COLUMNS = `CAST(logId AS CHAR) AS logId, CAST(runId AS CHAR) AS runId, loggedAt, lglConstituentId,
  CAST(personId AS CHAR) AS personId, field, compareCase AS \`case\`,
  request, lglEntryId, oldValue, newValue, outcome, responseStatus, note`

module.exports.appendLog = async function (items) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      await connection.query(
        `INSERT INTO sync_log (runId, lglConstituentId, personId, field, compareCase, request, lglEntryId,
           oldValue, newValue, outcome, responseStatus, note, loggedAt)
         VALUES ${items.map(() => '(?, ?, ?, ?, ?, CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, NOW(3))').join(', ')}`,
        items.flatMap(i => [
          i.runId ?? null, i.lglConstituentId, i.personId ?? null, i.field ?? null, i.case ?? null,
          JSON.stringify(i.request), i.lglEntryId ?? null, JSON.stringify(i.oldValue ?? null),
          JSON.stringify(i.newValue ?? null), i.outcome, i.responseStatus ?? null, i.note ?? null,
        ])
      )
    },
    statusObj: undefined
  })
  return { appended: items.length }
}

module.exports.getLog = async function ({ personId, lglConstituentId, runId, outcomes, since, limit = 500 } = {}) {
  const where = []
  const binds = []
  if (personId != null) { where.push('personId = ?'); binds.push(personId) }
  if (lglConstituentId != null) { where.push('lglConstituentId = ?'); binds.push(lglConstituentId) }
  if (runId != null) { where.push('runId = ?'); binds.push(runId) }
  if (outcomes?.length) { where.push('outcome IN (?)'); binds.push(outcomes) }
  if (since) { where.push('loggedAt >= ?'); binds.push(new Date(since)) }
  const [rows] = await dbUtils.pool.query(
    `SELECT ${LOG_COLUMNS} FROM sync_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY sync_log.logId DESC LIMIT ?`, [...binds, limit])
  return rows
}
