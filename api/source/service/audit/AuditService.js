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

// Boot-time fail-fast, two directions per registry entry:
//  - drift: execute every registry SELECT, so a renamed/dropped column throws;
//  - omission: read information_schema, so a real column missing from both
//    `columns` and `excluded` throws — otherwise a future migration could add
//    a column the audit trail silently never covers.
// A throw here is caught in bootstrap/dependencies.js, which logs it and sets
// app state to 'fail': the process stays up but every /api route answers 503
// (service-check middleware) except /op/state. Loud and immediate, though not
// a process exit.
async function validateShapes () {
  for (const [entityType, shape] of Object.entries(shapes)) {
    assertShapeInvariants(entityType, shape)
    try {
      await dbUtils.pool.query(buildRowSql(shape), [0])
      for (const decl of Object.values(shape.sets ?? {})) {
        await dbUtils.pool.query(decl.sql, [0])
      }
    } catch (e) {
      throw new Error(`audit shape '${entityType}' failed schema validation: ${e.message}`)
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
  try {
    await dbUtils.pool.query('SELECT auditId FROM audit_event WHERE auditId = ?', [0])
  } catch (e) {
    throw new Error(`audit_event table failed schema validation: ${e.message}`)
  }
}

module.exports = { readShape, record, validateShapes, buildRowSql, undeclaredColumns }
