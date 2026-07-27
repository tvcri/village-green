/** @returns {'null'|'array'|'object'|'string'|'number'|'boolean'|'undefined'} */
export function typeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

export function sizeOf(value) {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.keys(value).length
  return 0
}

/** Empty objects and arrays are leaves — a caret that opens onto nothing is a bug. */
export function isContainer(value) {
  const type = typeOf(value)
  return (type === 'object' || type === 'array') && sizeOf(value) > 0
}

/** The `{n}` / `[n]` annotation shown on a collapsed container. */
export function summaryOf(value) {
  const type = typeOf(value)
  if (type === 'array') return `[${sizeOf(value)}]`
  if (type === 'object') return `{${sizeOf(value)}}`
  return ''
}

/** Preview budget: characters of inner content, and how many entries to show. */
export const PREVIEW_CHARS = 88
export const PREVIEW_ENTRIES = 4

/** Longest single value shown in a preview; longer strings are clipped. */
export const PREVIEW_VALUE_CHARS = 32

/** A scalar as it appears INSIDE a preview — nested containers collapse to a glyph. */
function previewScalar(value) {
  const type = typeOf(value)
  if (type === 'string') {
    // Clamp per-value, not just per-preview: one long string (a notes field)
    // would otherwise consume the whole budget and push out the sibling keys
    // that make the preview worth showing at all.
    return value.length > PREVIEW_VALUE_CHARS
      ? `"${value.slice(0, PREVIEW_VALUE_CHARS)}…"`
      : `"${value}"`
  }
  if (type === 'array') return sizeOf(value) ? '[…]' : '[]'
  if (type === 'object') return sizeOf(value) ? '{…}' : '{}'
  return String(value)
}

/**
 * One-line preview of a collapsed container: `{villageId: "1", name: "Aquidneck", …}`.
 *
 * Two budgets, because either alone fails. A character cap alone can truncate
 * mid-key on wide objects; an entry cap alone lets one long string value (a
 * notes field) run past the width of the pane. Whichever binds first wins.
 *
 * Truncation is never mid-token: entries are added whole or not at all, so the
 * result is always readable. `…` marks that something was left out.
 *
 * Cost is bounded by PREVIEW_ENTRIES regardless of container size — this reads
 * at most that many entries, never the whole collection, and never recurses.
 *
 * @param {any} value
 * @returns {string} '' when there is nothing useful to preview
 */
export function previewOf(value) {
  if (!isContainer(value)) return ''
  const isArray = Array.isArray(value)
  const entries = isArray
    ? value.slice(0, PREVIEW_ENTRIES).map((v, i) => [String(i), v])
    : Object.entries(value).slice(0, PREVIEW_ENTRIES)

  const parts = []
  let used = 0
  for (const [key, item] of entries) {
    // Arrays don't repeat indices — they're implied by position.
    const text = isArray ? previewScalar(item) : `${key}: ${previewScalar(item)}`
    if (parts.length && used + text.length > PREVIEW_CHARS) break
    parts.push(text)
    used += text.length + 2 // ", "
  }
  if (!parts.length) return ''

  const complete = parts.length === sizeOf(value)
  const body = parts.join(', ') + (complete ? '' : ', …')
  return isArray ? `[${body}]` : `{${body}}`
}

/**
 * Children of a container, capped at `limit`.
 *
 * @param {any} value
 * @param {string} path this node's path key
 * @param {number} limit
 * @returns {{nodes: Array<{key: string, value: any, path: string}>, hidden: number}}
 */
export function childNodes(value, path, limit) {
  const entries = Array.isArray(value)
    ? value.map((item, i) => [String(i), item])
    : Object.entries(value ?? {})
  const shown = entries.slice(0, limit)
  return {
    nodes: shown.map(([key, item]) => ({ key, value: item, path: `${path}.${key}` })),
    hidden: entries.length - shown.length,
  }
}

/**
 * Path keys for every container within N levels — the initial expansion set.
 *
 * No cycle guard is needed and none should be added: API responses are
 * JSON.parse output, which cannot contain cycles by construction. (The
 * dereferenced spec was also verified acyclic.)
 *
 * @param {any} value
 * @param {number} depth
 * @param {string} [path]
 * @param {Set<string>} [acc]
 * @returns {Set<string>}
 */
export function pathsToDepth(value, depth, path = '$', acc = new Set()) {
  if (depth <= 0 || !isContainer(value)) return acc
  acc.add(path)
  const { nodes } = childNodes(value, path, Infinity)
  for (const child of nodes) pathsToDepth(child.value, depth - 1, child.path, acc)
  return acc
}
