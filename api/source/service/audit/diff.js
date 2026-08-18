'use strict'
// Pure diff/snapshot computation for audit_event rows. No DB access — inputs
// are rows already read through the app pool via AuditService.readShape, so
// both sides of a comparison share one representation (spec §5: like compares
// with like, by construction).

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

function columnNames (shape) {
  return shape.columns.map(c => (typeof c === 'string' ? c : c.name))
}

function normalizeRowObject (row) {
  const out = {}
  for (const k of Object.keys(row)) out[k] = normalize(row[k])
  return out
}

function diffColumns (shape, before, after) {
  const diff = {}
  for (const col of columnNames(shape)) {
    const a = normalize(before?.[col])
    const b = normalize(after?.[col])
    if (equal(a, b)) continue
    diff[col] = shape.redacted.includes(col) ? { changed: true } : { old: a, new: b }
  }
  return diff
}

function diffSets (shape, beforeSets, afterSets) {
  const out = {}
  for (const [name, decl] of Object.entries(shape.sets ?? {})) {
    const before = (beforeSets?.[name] ?? []).map(normalizeRowObject)
    const after = (afterSets?.[name] ?? []).map(normalizeRowObject)
    if (decl.kind === 'values') {
      const b = new Set(before.map(r => r.label))
      const a = new Set(after.map(r => r.label))
      const added = [...a].filter(x => !b.has(x))
      const removed = [...b].filter(x => !a.has(x))
      if (added.length || removed.length) {
        out[name] = { ...(added.length && { added }), ...(removed.length && { removed }) }
      }
    } else { // 'keyed'
      const key = decl.key ?? 'k'
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
  for (const col of columnNames(shape)) {
    const v = normalize(row?.[col])
    snap[col] = shape.redacted.includes(col) ? (v === null ? null : '[redacted]') : v
  }
  for (const [name, decl] of Object.entries(shape.sets ?? {})) {
    const rows = (sets?.[name] ?? []).map(normalizeRowObject)
    snap[name] = decl.kind === 'values' ? rows.map(r => r.label) : rows
  }
  return snap
}

// -> {snapshot} | {diff} | null (null = nothing changed, write no row)
function computeChanges (shape, { action, before, after, beforeSets, afterSets }) {
  if (action === 'create') return { snapshot: buildSnapshot(shape, after, afterSets) }
  if (action === 'delete') return { snapshot: buildSnapshot(shape, before, beforeSets) }
  const diff = { ...diffColumns(shape, before, after), ...diffSets(shape, beforeSets, afterSets) }
  return Object.keys(diff).length ? { diff } : null
}

module.exports = { computeChanges, buildSnapshot, normalize, equal, diffColumns, diffSets, columnNames }
