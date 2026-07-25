/**
 * Operations the browser deliberately does not list.
 *
 * streamStateSse returns text/event-stream and needs EventSource, not fetch —
 * a fetch would hang until the server gives up. Excluded rather than shown
 * disabled so every row in the table is executable.
 */
export const EXCLUDED_OPERATION_IDS = new Set(['streamStateSse'])

/**
 * Flatten an OpenApiOps operationMap into rows for the operation DataTable.
 *
 * @param {Map<string, {path: string, method: string, params: object, summary?: string, tags?: string[]}>} operationMap
 * @returns {Array<{operationId: string, method: string, tag: string, path: string, summary: string, paramCount: number}>}
 */
export function buildOperationRows(operationMap) {
  const rows = []
  for (const [operationId, op] of operationMap) {
    if (op.method !== 'get') continue
    if (EXCLUDED_OPERATION_IDS.has(operationId)) continue
    rows.push({
      operationId,
      method: op.method.toUpperCase(),
      tag: op.tags?.[0] ?? '',
      path: op.path,
      summary: op.summary ?? '',
      paramCount: Object.keys(op.params ?? {}).length,
    })
  }
  return rows.sort((a, b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path))
}
