// Rows from GET /metrics/persons. Members carry `status`, volunteers carry
// `active`; both carry count + completedRoundTrips.

// legs is pinned on this page (see MetaMetrics.vue): a completed round-trip
// ride counts as two.
export function completedCount (row) {
  return row.count + row.completedRoundTrips
}

// Ranges Caroline asked for. '0' is the one that matters: people on the active
// roster with no completed requests in range.
export const ACTIVITY_OPTIONS = [
  { value: 'all', label: 'All', test: () => true },
  { value: '0', label: '0', test: n => n === 0 },
  { value: '1-9', label: '1–9', test: n => n >= 1 && n <= 9 },
  { value: '10-19', label: '10–19', test: n => n >= 10 && n <= 19 },
  { value: '20-50', label: '20–50', test: n => n >= 20 && n <= 50 },
  { value: 'gt50', label: '>50', test: n => n > 50 },
]
export const ACTIVITY_VALUES = ACTIVITY_OPTIONS.map(o => o.value)

export function inActivity (n, bucket) {
  return ACTIVITY_OPTIONS.find(o => o.value === bucket)?.test(n) ?? true
}

export function isInactive (row) {
  return 'status' in row ? row.status !== 'Active' : row.active !== true
}

// villageNames: Map of villageId -> name, from the /metrics payload.
export function sortPeople (rows, field, dir, villageNames) {
  const sign = dir === 'desc' ? -1 : 1
  const byName = (a, b) => a.fullName.localeCompare(b.fullName)
  const compare = {
    fullName: byName,
    village: (a, b) => (villageNames.get(a.villageId) ?? '').localeCompare(villageNames.get(b.villageId) ?? ''),
    count: (a, b) => completedCount(a) - completedCount(b),
  }[field] ?? byName
  // Ties fall back to name ascending whichever way the column runs.
  return [...rows].sort((a, b) => sign * compare(a, b) || byName(a, b))
}
