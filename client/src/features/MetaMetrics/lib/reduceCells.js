// Pure reductions over the MetaMetrics `cells` payload (one cell per village x
// serviceName). Every chart on the page is one of these, so a chart switch or a
// status change never refetches.
//
// Verified against the dev DB: every field in a cell is additive — summing
// completedRoundTrips per cell equals the grand total — so these plain sums are
// safe, drilldowns included.

// Must stay in step with SERVICE_CATEGORIES in api/source/service/utils.js,
// which is the vocabulary's source of truth.
export const CATEGORY_ORDER = ['Rides', 'Errands', 'Home Help', 'Tech Support']

// The three drawn series. 'cancelled' merges the two client cancel statuses;
// 'Hub cancelled' never reaches the client. Colors are CVD-validated in both
// themes — see the design spec, "Palette".
export const STATUS_SERIES = [
  { key: 'completed', label: 'Completed', colorLight: '#1d4ed8', colorDark: '#3b82f6' },
  { key: 'cancelled', label: 'Cancelled', colorLight: '#ea580c', colorDark: '#e06c1f' },
  { key: 'unmatched', label: 'Unmatched', colorLight: '#9333ea', colorDark: '#a855f7' },
]

export function cellTotal (byStatus) {
  return byStatus.completed + byStatus.unmatched +
    byStatus.memberCancelled + byStatus.volunteerCancelled
}

function blank (extra) {
  return { ...extra, completed: 0, cancelled: 0, unmatched: 0, total: 0 }
}

// `legs` is a parameter with exactly ONE caller pinning it to true, on purpose.
// The federation counts a completed round trip as two services and will not
// count differently, so Meta Metrics ships no toggle. Keeping the arithmetic
// parameterised means restoring a toggle for a future multi-village-grant user
// is wiring a ref to an existing parameter, not a rework. Do not inline it.
function accumulate (row, byStatus, completedRoundTrips, legs) {
  const bump = legs ? completedRoundTrips : 0
  row.completed += byStatus.completed + bump
  row.cancelled += byStatus.memberCancelled + byStatus.volunteerCancelled
  row.unmatched += byStatus.unmatched
  row.total += cellTotal(byStatus) + bump
}

const byTotalDesc = (a, b) => b.total - a.total

export function byVillage (cells, villages, { legs = false } = {}) {
  // Seeded from `villages`, not from `cells`: a granted village with no
  // requests in range must still appear, at zero.
  const rows = new Map(
    villages.map(v => [v.villageId, blank({ villageId: v.villageId, villageName: v.villageName })])
  )
  for (const c of cells) {
    const row = rows.get(c.villageId)
    if (row) accumulate(row, c.byStatus, c.completedRoundTrips, legs)
  }
  return [...rows.values()].sort(byTotalDesc)
}

export function byServiceType (cells) {
  const rows = new Map()
  for (const c of cells) {
    if (!rows.has(c.serviceName)) rows.set(c.serviceName, blank({ serviceName: c.serviceName }))
    accumulate(rows.get(c.serviceName), c.byStatus, c.completedRoundTrips, false)
  }
  return [...rows.values()].sort(byTotalDesc)
}

export function byCategory (cells) {
  // Fixed order, zero-filled: chart colors and shapes stay stable regardless of
  // which categories have data. Cells with a null category (a serviceName
  // matching no prefix) are excluded rather than bucketed.
  const rows = new Map(CATEGORY_ORDER.map(c => [c, blank({ category: c })]))
  for (const c of cells) {
    const row = c.category === null ? undefined : rows.get(c.category)
    if (row) accumulate(row, c.byStatus, c.completedRoundTrips, false)
  }
  return [...rows.values()]
}
