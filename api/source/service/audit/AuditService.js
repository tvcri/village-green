'use strict'
const dbUtils = require('../utils')
const { shapes, assertShapeInvariants } = require('./shapes')
const { computeChanges, requiredSetAlias } = require('./diff')

function shapeFor (entityType) {
  const shape = shapes[entityType]
  if (!shape) throw new Error(`audit: unknown entityType '${entityType}'`)
  return shape
}

// Capture-everything: every real column rides along automatically, and
// extras (label expressions) are additive — they can never replace or hide
// a column. DATE columns are returned as 'YYYY-MM-DD' strings via the
// per-query dateStrings option (civil values, never JS Dates); DATETIME
// stays a Date and normalizes to a UTC instant string in the differ.
function buildRowSql (shape) {
  const extras = (shape.extras ?? []).map(e => `, ${e.expr} AS \`${e.name}\``).join('')
  return `SELECT t.*${extras} FROM ${shape.table} t WHERE t.\`${shape.idColumn ?? 'id'}\` = ?`
}

// Read the full audited shape of one entity ON THE CALLER'S TRANSACTION
// CONNECTION (never the pool — the read must see the transaction's own
// uncommitted writes). row is null when the entity doesn't exist.
//
// A null/undefined entityId is the "doesn't exist yet" case (the before-read
// of a create) and returns the empty shape without querying — total rather
// than partial, so callers never guard the call with a ternary. It is the
// same answer the query would give (WHERE id = NULL matches nothing), minus
// the round-trips.
//
// This is a non-locking REPEATABLE READ snapshot: a write committed by
// another transaction between this before-read and this transaction's
// UPDATE gets folded into this actor's diff as if they made it. Vanishingly
// rare at VG's write volume, accepted; a FOR UPDATE before-read would close
// it if ever needed.
async function readShape (connection, entityType, entityId) {
  const shape = shapeFor(entityType)
  if (entityId === null || entityId === undefined) return { row: null, sets: {} }
  const [rows] = await connection.query({ sql: buildRowSql(shape), dateStrings: ['DATE'] }, [entityId])
  const row = rows[0] ?? null
  const sets = {}
  for (const [name, decl] of Object.entries(shape.sets ?? {})) {
    const [setRows] = await connection.query({ sql: decl.sql, dateStrings: ['DATE'] }, [entityId])
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

// Wrap a mutation in its before/after reads and record the result. Owns the
// whole ceremony: both reads, the create-vs-update derivation, and the
// record call. Runs on the caller's open transaction connection.
//
// entityId may be null when the mutation CREATES the entity — in that case
// mutateFn must return the new id (the after-read has nothing else to key
// on). That obligation is enforced below rather than left implicit: a
// mutateFn that returns nothing throws here instead of silently recording an
// empty snapshot. When entityId is supplied, mutateFn's return value is
// ignored.
//
// action defaults to 'create' or 'update' by whether the entity existed
// before, which is the same test every call site used to hand-write.
async function auditUpdate (connection, { entityType, entityId = null, userId, action }, mutateFn) {
  const before = await readShape(connection, entityType, entityId)
  const created = await mutateFn()
  const id = entityId ?? created
  if (id === null || id === undefined) {
    throw new Error(
      `audit: ${entityType} mutateFn must return the new entity id when entityId is null`)
  }
  const after = await readShape(connection, entityType, id)
  await record(connection, {
    entityType, entityId: id, userId,
    action: action ?? (before.row ? 'update' : 'create'),
    before: before.row, beforeSets: before.sets,
    after: after.row, afterSets: after.sets,
  })
  return id
}

// Wrap a delete in its before-read and record the snapshot. Deleting an
// entity that doesn't exist records nothing — the guard is structural here
// so no call site has to remember it. Returns mutateFn's value.
async function auditDelete (connection, { entityType, entityId, userId }, mutateFn) {
  const before = await readShape(connection, entityType, entityId)
  const result = await mutateFn()
  if (before.row) {
    await record(connection, {
      entityType, entityId, action: 'delete', userId,
      before: before.row, beforeSets: before.sets,
    })
  }
  return result
}

// Wrap a mutation that changes the audited shape of SEVERAL entities at once
// (group membership rewrites, village grant replacement) — before-shapes for
// every affected id are read ahead of the mutation, afters after it, and one
// row is recorded per id. Unchanged entities diff to null and write nothing,
// so over-broad id sets are safe. Keeping both loops here is the point: they
// have to stay symmetric, and that is easy to get wrong once per call site.
async function auditFanOut (connection, { entityType, entityIds, userId, action = 'update' }, mutateFn) {
  const ids = [...new Set(entityIds)]
  const befores = new Map()
  for (const id of ids) befores.set(id, await readShape(connection, entityType, id))
  const result = await mutateFn()
  for (const id of ids) {
    const before = befores.get(id)
    const after = await readShape(connection, entityType, id)
    await record(connection, {
      entityType, entityId: id, action, userId,
      before: before.row, beforeSets: before.sets,
      after: after.row, afterSets: after.sets,
    })
  }
  return result
}

// Set-level omission/stale check: entity tables capture everything via
// SELECT t.*, but set SQL is a hand projection — so every real column on a
// set's source table must appear in its sourceColumns (a new junction
// column forces a decision), and every declared sourceColumn must still
// exist. Pure; exported for unit tests.
function setColumnGaps (decl, actualColumnNames) {
  return {
    undeclared: actualColumnNames.filter(c => !decl.sourceColumns.includes(c)),
    stale: decl.sourceColumns.filter(c => !actualColumnNames.includes(c)),
  }
}

// Aliases that would shadow a real column in the SELECT t.* result row —
// an extras name or set name equal to a real column would silently
// overwrite the raw value (extras) or the snapshot key (sets). Pure;
// exported for unit tests.
function shadowedAliases (shape, actualColumnNames) {
  const aliases = [...(shape.extras ?? []).map(e => e.name), ...Object.keys(shape.sets ?? {})]
  return aliases.filter(a => actualColumnNames.includes(a))
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

// Boot-time fail-fast. Capture is SELECT t.* — columns cannot be omitted or
// drift, so validation guards only the declared judgment:
//  - every row/set SELECT must execute against the live schema (a stale
//    extras expr or set SQL throws here);
//  - each set's SQL must produce the alias the differ reads (a renamed alias
//    is valid SQL, so only this stands between a typo and every set diff
//    silently comparing undefined to undefined);
//  - extras/set names must not shadow a real column of the entity table;
//  - the FK scan (unaccountedReferencingTables), so a future junction table
//    referencing an audited entity forces a fold-or-acknowledge decision.
// A throw here is caught in bootstrap/dependencies.js, which logs it and sets
// app state to 'fail': the process stays up but every /api route answers 503
// (service-check middleware) except /op/state. Loud and immediate, though not
// a process exit.
async function validateShapes () {
  for (const [entityType, shape] of Object.entries(shapes)) {
    assertShapeInvariants(entityType, shape)
    const setFields = new Map()
    try {
      await dbUtils.pool.query({ sql: buildRowSql(shape), dateStrings: ['DATE'] }, [0])
      for (const [setName, decl] of Object.entries(shape.sets ?? {})) {
        const [, fields] = await dbUtils.pool.query({ sql: decl.sql, dateStrings: ['DATE'] }, [0])
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
    const shadowed = shadowedAliases(shape, cols.map(c => c.COLUMN_NAME))
    if (shadowed.length) {
      throw new Error(
        `audit shape '${entityType}': aliases shadow real columns: ${shadowed.join(', ')} — ` +
        `rename the extras/set in service/audit/shapes.js`)
    }
    for (const [setName, decl] of Object.entries(shape.sets ?? {})) {
      const [setCols] = await dbUtils.pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [decl.table])
      const gaps = setColumnGaps(decl, setCols.map(c => c.COLUMN_NAME))
      if (gaps.undeclared.length) {
        throw new Error(
          `audit shape '${entityType}': set '${setName}' source table '${decl.table}' has ` +
          `undeclared columns: ${gaps.undeclared.join(', ')} — add each to the set's sourceColumns ` +
          `(and decide whether its sql should expose it) in service/audit/shapes.js`)
      }
      if (gaps.stale.length) {
        throw new Error(
          `audit shape '${entityType}': set '${setName}' has stale sourceColumns: ` +
          `${gaps.stale.join(', ')} — the columns no longer exist on '${decl.table}'`)
      }
    }
  }
  const [fkRows] = await dbUtils.pool.query(
    `SELECT DISTINCT TABLE_NAME, REFERENCED_TABLE_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_SCHEMA = DATABASE()
       AND REFERENCED_TABLE_NAME IS NOT NULL`)
  const unaccounted = unaccountedReferencingTables(shapes, fkRows)
  if (unaccounted.length) {
    throw new Error(
      'audit: tables reference audited entities but are neither declared set sources, ' +
      'audited entities, nor relatedTables: ' +
      unaccounted.map(u => `${u.table} -> ${u.entityType}`).join(', ') +
      ' — fold each as a set or add it to relatedTables in service/audit/shapes.js')
  }
  try {
    // Every column record() writes, plus the defaults — INSERT-side coverage.
    await dbUtils.pool.query(
      'SELECT auditId, entityType, entityId, action, userId, changes, createdAt FROM audit_event WHERE auditId = ?', [0])
  } catch (e) {
    throw new Error(`audit_event table failed schema validation: ${e.message}`)
  }
}

module.exports = { readShape, record, auditUpdate, auditDelete, auditFanOut, validateShapes, buildRowSql, shadowedAliases, setColumnGaps, unaccountedReferencingTables, requiredSetAlias }
