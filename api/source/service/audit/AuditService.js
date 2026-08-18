'use strict'
const dbUtils = require('../utils')
const { shapes, assertShapeInvariants } = require('./shapes')
const { computeChanges } = require('./diff')

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

// Boot-time fail-fast: execute every registry SELECT against the live schema.
// A registry/schema mismatch (the likely failure after a refactor) stops the
// process at startup with a named error instead of failing mutations later.
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
  }
}

module.exports = { readShape, record, validateShapes, buildRowSql }
