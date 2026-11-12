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
