// Rows from GET /metrics/persons. Members carry `status`, volunteers carry
// `active`; both carry count + completedRoundTrips.

// legs is pinned on this page (see MetaMetrics.vue): a completed round-trip
// ride counts as two.
export function completedCount (row) {
  return row.count + row.completedRoundTrips
}

// Caroline's buckets after trying the tab: '0' is the one that matters
// (people on the active roster with no completed requests in range). Every
// count lands in exactly one.
export const ACTIVITY_OPTIONS = [
  { value: 'all', label: 'All', test: () => true },
  { value: '0', label: '0', test: n => n === 0 },
  { value: '1-49', label: '1–49', test: n => n >= 1 && n <= 49 },
  { value: '50plus', label: '50+', test: n => n >= 50 },
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

// ---- CSV ----
// The download is for working with the list in a spreadsheet, so every row
// says its village and status even when the screen omits them.
export function peopleCsvColumns (nameHeader) {
  return [
    { header: nameHeader, key: 'fullName' },
    { header: 'Village', key: 'village' },
    { header: 'Status', key: 'status' },
    { header: 'Completed', key: 'completed' },
  ]
}

// Members carry their status word (Dropped, ...); volunteers only a flag.
export const statusOf = (row) => ('status' in row
  ? (row.status ?? 'Inactive')
  : (row.active === true ? 'Active' : 'Inactive'))

export function peopleCsvRows (rows, villageNames) {
  return rows.map(r => ({
    fullName: r.fullName,
    village: villageNames.get(r.villageId) ?? '',
    status: statusOf(r),
    completed: completedCount(r),
  }))
}

const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// The village and bucket are in the filename because they are baked into
// the contents.
export function peopleCsvFilename ({ villageName, list, activity, start, end }) {
  const parts = ['tvcri-people', slug(villageName), list]
  if (activity && activity !== 'all') parts.push(activity)
  parts.push(start, end)
  return `${parts.join('-')}.csv`
}
