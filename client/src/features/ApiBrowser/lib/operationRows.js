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
 * Operations marked `x-elevation-required` in the spec are hidden from users
 * who cannot elevate: the API would reject every one of them, so listing them
 * would offer nothing but guaranteed 403s. Users who CAN elevate still see
 * them regardless of whether they are currently elevated — gating on live
 * elevation state would make rows appear and vanish as the user toggles it.
 *
 * @param {Map<string, {path: string, method: string, params: object, summary?: string, tags?: string[], elevationRequired?: boolean}>} operationMap
 * @param {object} [options]
 * @param {boolean} [options.canElevate] - when false, elevation-required operations are omitted
 * @returns {Array<{operationId: string, method: string, tag: string, path: string, summary: string}>}
 */
export function buildOperationRows(operationMap, { canElevate = false } = {}) {
  const rows = []
  for (const [operationId, op] of operationMap) {
    if (op.method !== 'get') continue
    if (EXCLUDED_OPERATION_IDS.has(operationId)) continue
    if (op.elevationRequired && !canElevate) continue
    rows.push({
      operationId,
      method: op.method.toUpperCase(),
      tag: op.tags?.[0] ?? '',
      path: op.path,
      summary: op.summary ?? '',
    })
  }
  return rows.sort((a, b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path))
}
