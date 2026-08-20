'use strict'
// Pure diff/snapshot computation for audit_event rows. No DB access — inputs
// are rows already read through the app pool via AuditService.readShape, so
// both sides of a comparison share one representation (spec §5: like compares
// with like, by construction). Rows are SELECT t.* plus any extras aliases;
// the differ works over whatever keys the rows carry — there is no column
// catalog to fall out of sync with.

function normalize (v) {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  if (Buffer.isBuffer(v)) return v.toString('hex')
  return v
}

function sortKeys (v) {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v !== null && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k])
    return out
  }
  return v
}

function equal (a, b) {
  if (a === b) return true
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))
  }
  return false
}

function normalizeRowObject (row) {
  const out = {}
  for (const k of Object.keys(row)) out[k] = normalize(row[k])
  return out
}

function diffColumns (before, after) {
  const diff = {}
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  for (const col of keys) {
    const a = normalize(before?.[col])
    const b = normalize(after?.[col])
    if (equal(a, b)) continue
    diff[col] = { old: a, new: b }
  }
  return diff
}

// The alias a set's SQL must produce for this differ to see anything:
// 'values' sets are diffed on that alias's value, 'keyed' sets are indexed
// on it. Defined here — next to the reads — so boot validation
// (AuditService.validateShapes) checks exactly what this file consumes.
function requiredSetAlias (decl) {
  return decl.kind === 'values' ? 'label' : decl.key
}

function diffSets (shape, beforeSets, afterSets) {
  const out = {}
  for (const [name, decl] of Object.entries(shape.sets ?? {})) {
    const before = (beforeSets?.[name] ?? []).map(normalizeRowObject)
    const after = (afterSets?.[name] ?? []).map(normalizeRowObject)
    const alias = requiredSetAlias(decl)
    if (decl.kind === 'values') {
      const b = new Set(before.map(r => r[alias]))
      const a = new Set(after.map(r => r[alias]))
      const added = [...a].filter(x => !b.has(x))
      const removed = [...b].filter(x => !a.has(x))
      if (added.length || removed.length) {
        out[name] = { ...(added.length && { added }), ...(removed.length && { removed }) }
      }
    } else { // 'keyed'
      const key = alias
      const bIdx = new Map(before.map(r => [r[key], r]))
      const aIdx = new Map(after.map(r => [r[key], r]))
      const added = [...aIdx.values()].filter(r => !bIdx.has(r[key]))
      const removed = [...bIdx.values()].filter(r => !aIdx.has(r[key]))
      const changed = []
      for (const [k, bRow] of bIdx) {
        const aRow = aIdx.get(k)
        if (aRow && !equal(bRow, aRow)) changed.push({ key: k, old: bRow, new: aRow })
      }
      if (added.length || removed.length || changed.length) {
        out[name] = { ...(added.length && { added }), ...(removed.length && { removed }), ...(changed.length && { changed }) }
      }
    }
  }
  return out
}

function buildSnapshot (shape, row, sets) {
  const snap = {}
  for (const col of Object.keys(row ?? {})) {
    snap[col] = normalize(row[col])
  }
  for (const [name, decl] of Object.entries(shape.sets ?? {})) {
    const rows = (sets?.[name] ?? []).map(normalizeRowObject)
    snap[name] = decl.kind === 'values' ? rows.map(r => r[requiredSetAlias(decl)]) : rows
  }
  return snap
}

// -> {snapshot} | {diff} | null (null = nothing changed, write no row)
function computeChanges (shape, { action, before, after, beforeSets, afterSets }) {
  if (action === 'create') return { snapshot: buildSnapshot(shape, after, afterSets) }
  if (action === 'delete') return { snapshot: buildSnapshot(shape, before, beforeSets) }
  const diff = { ...diffColumns(before, after), ...diffSets(shape, beforeSets, afterSets) }
  return Object.keys(diff).length ? { diff } : null
}

module.exports = { computeChanges, buildSnapshot, normalize, equal, diffColumns, diffSets, requiredSetAlias }
