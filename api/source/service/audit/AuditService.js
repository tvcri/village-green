'use strict'
const dbUtils = require('../utils')
const { shapes, assertShapeInvariants } = require('./shapes')
const { computeChanges, columnNames } = require('./diff')

function shapeFor (entityType) {
  const shape = shapes[entityType]
  if (!shape) throw new Error(`audit: unknown entityType '${entityType}'`)
  return shape
}

function buildRowSql (shape) {
  const cols = shape.columns.map(c =>
    typeof c === 'string' ? `t.\`${c}\`` : `${c.expr} AS \`${c.name}\``)
  return `SELECT ${cols.join(', ')} FROM ${shape.table} t WHERE t.\`${shape.idColumn ?? 'id'}\` = ?`
}

// Read the full audited shape of one entity ON THE CALLER'S TRANSACTION
// CONNECTION (never the pool — the read must see the transaction's own
// uncommitted writes). row is null when the entity doesn't exist.
//
// This is a non-locking REPEATABLE READ snapshot: a write committed by
// another transaction between this before-read and this transaction's
// UPDATE gets folded into this actor's diff as if they made it. Vanishingly
// rare at VG's write volume, accepted; a FOR UPDATE before-read would close
// it if ever needed.
async function readShape (connection, entityType, entityId) {
  const shape = shapeFor(entityType)
  const [rows] = await connection.query(buildRowSql(shape), [entityId])
  const row = rows[0] ?? null
  const sets = {}
  for (const [name, decl] of Object.entries(shape.sets ?? {})) {
    const [setRows] = await connection.query(decl.sql, [entityId])
    sets[name] = setRows
  }
  return { row, sets }
}

// Write one audit_event row on the caller's open transaction connection so it
// shares the mutation's commit/rollback fate. Empty diffs write nothing.
async function record (connection, { entityType, entityId, action, userId, before, after, beforeSets, afterSets }) {
  const shape = shapeFor(entityType)
  const changes = computeChanges(shape, { action, before, after, beforeSets, afterSets })
  if (!changes) return
  await connection.query(
    'INSERT INTO audit_event (entityType, entityId, action, userId, changes) VALUES (?, ?, ?, ?, ?)',
    [entityType, entityId, action, userId, JSON.stringify(changes)]
  )
}

// The omission half of boot validation: every real column on an audited
// table must be audited (`columns`), deliberately not (`excluded`), or the
// id column (covered structurally). Expr aliases in `columns` are not real
// columns and simply never match. Pure; exported for unit tests.
function undeclaredColumns (shape, actualColumnNames) {
  const declared = new Set([...columnNames(shape), ...shape.excluded, shape.idColumn ?? 'id'])
  return actualColumnNames.filter(c => !declared.has(c))
}

// The junction half of boot validation: every table holding an FK into an
// audited table must be a declared set source (folded), itself an audited
// entity, or listed in that entity's relatedTables (deliberately not
// folded) — otherwise a future junction/child table could carry entity
// data the trail silently never covers. fkRows are
// {TABLE_NAME, REFERENCED_TABLE_NAME} pairs; returns deduped
// [{table, entityType}] for everything unaccounted. Pure; exported for
// unit tests.
function unaccountedReferencingTables (registry, fkRows) {
  const auditedTables = new Map(Object.entries(registry).map(([type, s]) => [s.table, type]))
  const out = new Map()
  for (const { TABLE_NAME: t, REFERENCED_TABLE_NAME: ref } of fkRows) {
    const entityType = auditedTables.get(ref)
    if (!entityType) continue
    if (auditedTables.has(t)) continue
    const shape = registry[entityType]
    const setTables = Object.values(shape.sets ?? {}).map(d => d.table)
    if (setTables.includes(t)) continue
    if (shape.relatedTables.includes(t)) continue
    out.set(`${t}->${entityType}`, { table: t, entityType })
  }
  return [...out.values()]
}

// The alias a set's SQL must produce for the differ to see anything:
// 'values' sets are diffed on r.label, 'keyed' sets are indexed on r[key].
// A renamed alias is valid SQL, so only this check stands between a typo
// and every diff silently comparing undefined to undefined.
function requiredSetAlias (decl) {
  return decl.kind === 'values' ? 'label' : decl.key
}

// Boot-time fail-fast, two directions per registry entry:
//  - drift: execute every registry SELECT, so a renamed/dropped column throws;
//  - omission: read information_schema, so a real column missing from both
//    `columns` and `excluded` throws — otherwise a future migration could add
//    a column the audit trail silently never covers.
// Plus one cross-entity check: an FK scan (unaccountedReferencingTables), so
// a future junction table referencing an audited entity forces a fold-or-
// acknowledge decision the same way a new column does.
// A throw here is caught in bootstrap/dependencies.js, which logs it and sets
// app state to 'fail': the process stays up but every /api route answers 503
// (service-check middleware) except /op/state. Loud and immediate, though not
// a process exit.
async function validateShapes () {
  for (const [entityType, shape] of Object.entries(shapes)) {
    assertShapeInvariants(entityType, shape)
    const setFields = new Map()
    try {
      await dbUtils.pool.query(buildRowSql(shape), [0])
      for (const [setName, decl] of Object.entries(shape.sets ?? {})) {
        const [, fields] = await dbUtils.pool.query(decl.sql, [0])
        setFields.set(setName, fields.map(f => f.name))
      }
    } catch (e) {
      throw new Error(`audit shape '${entityType}' failed schema validation: ${e.message}`)
    }
    for (const [setName, decl] of Object.entries(shape.sets ?? {})) {
      const alias = requiredSetAlias(decl)
      if (!setFields.get(setName).includes(alias)) {
        throw new Error(
          `audit shape '${entityType}': set '${setName}' sql does not produce required alias ` +
          `'${alias}' — the differ reads it; check the SELECT's AS clauses`)
      }
    }
    const [cols] = await dbUtils.pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [shape.table])
    const missing = undeclaredColumns(shape, cols.map(c => c.COLUMN_NAME))
    if (missing.length) {
      throw new Error(
        `audit shape '${entityType}': undeclared columns: ${missing.join(', ')} — ` +
        `add each to columns (audited) or excluded (deliberately not) in service/audit/shapes.js`)
    }
  }
  const [fkRows] = await dbUtils.pool.query(
    `SELECT DISTINCT TABLE_NAME, REFERENCED_TABLE_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`)
  const unaccounted = unaccountedReferencingTables(shapes, fkRows)
  if (unaccounted.length) {
    throw new Error(
      'audit: tables reference audited entities but are neither declared set sources, ' +
      'audited entities, nor relatedTables: ' +
      unaccounted.map(u => `${u.table} -> ${u.entityType}`).join(', ') +
      ' — fold each as a set or add it to relatedTables in service/audit/shapes.js')
  }
  try {
    await dbUtils.pool.query('SELECT auditId FROM audit_event WHERE auditId = ?', [0])
  } catch (e) {
    throw new Error(`audit_event table failed schema validation: ${e.message}`)
  }
}

module.exports = { readShape, record, validateShapes, buildRowSql, undeclaredColumns, unaccountedReferencingTables, requiredSetAlias }
