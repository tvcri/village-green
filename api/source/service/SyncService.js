'use strict';
const dbUtils = require('./utils')
const config = require('../utils/config')

// Storage and feeds for the vg-sync service (repo tvcri/vg-sync). Nothing
// here deletes: holds change state, runs are finished, memory is overwritten,
// and the LGL write log is append-only.

const parseJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v)

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
      for (const f of Object.keys(parseJson(r.changes)?.diff ?? {})) entry.fields.add(f)
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
