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
