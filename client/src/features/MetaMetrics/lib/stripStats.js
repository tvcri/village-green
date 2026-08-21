// Village Metrics' strip has four cards. Meta adds a fifth, Villages, because
// scope is grant-derived and varies by caller — how many villages are in scope
// is itself information.
export function metaStripStats (rows) {
  return {
    villages: rows.length,
    requests: rows.reduce((sum, r) => sum + r.total, 0),
    completed: rows.reduce((sum, r) => sum + r.completed, 0),
    cancelled: rows.reduce((sum, r) => sum + r.cancelled, 0),
    unmatched: rows.reduce((sum, r) => sum + r.unmatched, 0),
  }
}
