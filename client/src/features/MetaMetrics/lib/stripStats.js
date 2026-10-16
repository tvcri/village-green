// Village Metrics' strip has four cards. Meta adds a fifth, Villages, because
// scope is grant-derived and varies by caller — how many villages are in scope
// is itself information.
export function metaStripStats (rows) {
  const requests = rows.reduce((sum, r) => sum + r.total, 0)
  const completed = rows.reduce((sum, r) => sum + r.completed, 0)
  const cancelled = rows.reduce((sum, r) => sum + r.cancelled, 0)
  const unmatched = rows.reduce((sum, r) => sum + r.unmatched, 0)

  // Only the three outcomes get a percentage, and they do not share a base:
  // Completed and Cancelled are shares of Requests ("of all"), while the
  // unmatched rate leaves cancelled requests out — unmatched ÷ (unmatched +
  // completed), "of not cancelled" — so the three no longer sum to 100%. Each
  // carries its base so the strip and the PDF name it. Villages and Requests
  // have no denominator, so a percentage beside them would be noise dressed
  // as information.
  //
  // null, not 0, when there is nothing to divide by — the caller renders
  // nothing at all rather than an authoritative-looking "0.0%".
  const pct = (value, base) => (base === 0 ? null : (value / base) * 100)

  return {
    villages: rows.length,
    requests,
    completed,
    cancelled,
    unmatched,
    completedPct: pct(completed, requests),
    cancelledPct: pct(cancelled, requests),
    unmatchedPct: pct(unmatched, unmatched + completed),
    completedPctBase: 'of all',
    cancelledPctBase: 'of all',
    unmatchedPctBase: 'of not cancelled',
  }
}
