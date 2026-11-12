'use strict';
const dbUtils = require('./utils')
const config = require('../utils/config')

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

module.exports.getChanges = async function ({ after, limit }) {
  const [scanned] = await dbUtils.pool.query(
    `SELECT auditId, entityType, entityId, action, changes
     FROM audit_event
     WHERE auditId > ? AND createdAt <= NOW(3) - INTERVAL ? SECOND
     ORDER BY auditId
     LIMIT ?`,
    [after, config.settings.syncChangeSettleSeconds, limit + 1]
  )
  const more = scanned.length > limit
  const rows = more ? scanned.slice(0, limit) : scanned
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
    if (r.action === 'update') {
      for (const f of Object.keys(r.changes?.diff ?? {})) entry.fields.add(f)
    }
  }

  return {
    lastAuditId,
    more,
    persons: [...persons].map(([personId, byType]) => ({
      personId: Number(personId),
      changes: [...byType].map(([entityType, e]) => ({
        entityType, actions: e.actions, fields: [...e.fields].sort(),
      })),
    })),
  }
}

// ---- memory (sync_field) ----

const FIELD_COLUMNS = 'personId, field, lglConstituentId, value, lglEntryId, agreedAt'

module.exports.getFields = async function ({ personIds } = {}) {
  const filter = personIds?.length ? 'WHERE personId IN (?)' : ''
  const [rows] = await dbUtils.pool.query(
    `SELECT ${FIELD_COLUMNS} FROM sync_field ${filter} ORDER BY personId, field`,
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

const SmError = require('../utils/error')
const HOLD_COLUMNS = `holdId, lglConstituentId, personId, field, reason, detail, fingerprint, state,
  dismissalKind, firstSeenAt, lastSeenAt, closedAt, dismissedAt, dismissedUserId, note`
const isOpenCollision = (e) => e.code === 'ER_DUP_ENTRY' && /sync_hold_open/.test(e.message)

async function holdsByIds (ids) {
  if (!ids.length) return []
  const [rows] = await dbUtils.pool.query(`SELECT ${HOLD_COLUMNS} FROM sync_hold WHERE holdId IN (?)`, [ids])
  const byId = new Map(rows.map(r => [r.holdId, r]))
  return ids.map(id => byId.get(id))
}

module.exports.getHolds = async function ({ states = ['open'], personId, lglConstituentId } = {}) {
  const where = ['state IN (?)']
  const binds = [states]
  if (personId != null) { where.push('personId = ?'); binds.push(personId) }
  if (lglConstituentId != null) { where.push('lglConstituentId = ?'); binds.push(lglConstituentId) }
  const [rows] = await dbUtils.pool.query(
    `SELECT ${HOLD_COLUMNS} FROM sync_hold WHERE ${where.join(' AND ')} ORDER BY holdId`, binds)
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
        try {
          const [res] = await connection.query(
            `INSERT INTO sync_hold (lglConstituentId, personId, field, reason, detail, fingerprint, state,
               dismissalKind, dismissedAt, dismissedUserId, note, firstSeenAt, lastSeenAt)
             VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ${dismissed ? 'NOW(3)' : 'NULL'}, ?, ?, NOW(3), NOW(3))`,
            [item.lglConstituentId, item.personId ?? null, item.field ?? null, item.reason,
              JSON.stringify(item.detail ?? null), item.fingerprint, dismissed ? 'dismissed' : 'open',
              dismissed ? item.dismissalKind : null, dismissed ? userId : null, item.note ?? null]
          )
          created.push(res.insertId)
        }
        catch (e) {
          if (isOpenCollision(e)) {
            throw new SmError.ConflictError(`item ${i}: an open hold for this constituent, person, field and reason already exists`)
          }
          throw e
        }
      }
      return created
    },
    statusObj: undefined
  })
  return holdsByIds(ids)
}

// Allowed patch transitions: open -> closed, dismissed -> open.
module.exports.patchHolds = async function (items) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const ids = items.map(i => i.holdId)
      const [rows] = await connection.query(
        'SELECT holdId, state FROM sync_hold WHERE holdId IN (?) FOR UPDATE', [ids])
      const state = new Map(rows.map(r => [r.holdId, r.state]))
      for (const [i, item] of items.entries()) {
        if (!state.has(item.holdId)) throw new SmError.NotFoundError(`item ${i}: no hold ${item.holdId}`)
      }
      for (const [i, item] of items.entries()) {
        const sets = []
        const binds = []
        if (item.seen) sets.push('lastSeenAt = NOW(3)')
        if (item.fingerprint !== undefined) { sets.push('fingerprint = ?'); binds.push(item.fingerprint) }
        if ('detail' in item) { sets.push('detail = CAST(? AS JSON)'); binds.push(JSON.stringify(item.detail ?? null)) }
        if (item.state !== undefined) {
          const from = state.get(item.holdId)
          if (item.state === 'closed' && from === 'open') {
            sets.push("state = 'closed'", 'closedAt = NOW(3)')
          }
          else if (item.state === 'open' && from === 'dismissed') {
            sets.push("state = 'open'", 'dismissalKind = NULL', 'dismissedAt = NULL', 'dismissedUserId = NULL', 'note = NULL')
          }
          else {
            throw new SmError.UnprocessableError(`item ${i}: a hold cannot go from ${from} to ${item.state}`)
          }
          state.set(item.holdId, item.state)
        }
        if (!sets.length) continue
        try {
          await connection.query(`UPDATE sync_hold SET ${sets.join(', ')} WHERE holdId = ?`, [...binds, item.holdId])
        }
        catch (e) {
          if (isOpenCollision(e)) {
            throw new SmError.ConflictError(`item ${i}: an open hold for this constituent, person, field and reason already exists`)
          }
          throw e
        }
      }
    },
    statusObj: undefined
  })
  return { updated: items.length }
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
