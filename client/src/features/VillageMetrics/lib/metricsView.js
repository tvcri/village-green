// Pure view-model helpers for the Village Metrics dashboard: no Vue, no DOM.
// Consumes the VillageMetrics API payload shape (api/source/specification/village-green.yaml
// components.schemas.VillageMetrics) and produces chart/strip data ready for the components
// in this feature to render.

// Terminal statuses only — the API reports on settled requests, so 'open' and
// 'confirmed' never appear in a byStatus payload. See
// dbUtils.TERMINAL_SR_STATUSES (api/source/service/utils.js).
export const STATUS_ORDER = [
  'completed', 'unmatched', 'memberCancelled', 'volunteerCancelled',
]

export const STATUS_LABELS = {
  completed: 'Completed',
  unmatched: 'Unmatched',
  memberCancelled: 'Member cancelled',
  volunteerCancelled: 'Volunteer cancelled',
}

export const STATUS_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  ...STATUS_ORDER.map(k => ({ label: STATUS_LABELS[k], value: k })),
]

// Category slice colors — mirrors VolunteerHome's --cat-* hues (client/src/features/VolunteerHome/components/VolunteerHome.vue).
// Keep these two in sync: VolunteerHome uses the same 4 hues for Rides/Errands/Home Help/Tech
// Support (color-mixed into --cat-*-bg/-border); Member Added is metrics-only, no VolunteerHome equivalent.
export const CATEGORY_COLORS = {
  Rides: '#22c55e',
  Errands: '#f59e0b',
  'Home Help': '#3b82f6',
  'Tech Support': '#8b5cf6',
  'Member Added': '#64748b',
}

// TEMPORARY display-only shortening, pending a serviceName rename in the SR table.
// 'Household Chores/Handy Help' is a serviceName whose category is already 'Home Help'
// (api/source/service/utils.js maps the two), and the long string dominates the y-axis
// of a horizontal bar chart. VolunteerHome does the same thing at
// features/VolunteerHome/lib/serviceCategories.js ({ label: 'Home Help', prefix: ... }).
//
// DELETE THIS when serviceName is renamed in the database: the ?? fallthrough below makes
// an unmapped name pass through unchanged, so removing the entry is a no-op at that point.
// Its alphabetical slot is unaffected — 'Home Help' and 'Household…' both sort after every
// 'Errand:' and before every 'Ride:', and the tie-break only compares equal-count entries.
const SERVICE_LABELS = {
  'Household Chores/Handy Help': 'Home Help',
}

const SERVICE_COLOR_RAMP = ['#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b']
const OTHER_COLOR = '#94a3b8'

const OUTCOME_SPECS = [
  { label: 'Completed', statusKey: 'completed', color: '#22c55e', legs: true },
  { label: 'Member cancelled', statusKey: 'memberCancelled', color: '#f59e0b', legs: false },
  { label: 'Volunteer cancelled', statusKey: 'volunteerCancelled', color: '#ef4444', legs: false },
  { label: 'Unmatched', statusKey: 'unmatched', color: '#94a3b8', legs: false },
]

// sel 'all' -> sum of every status key in STATUS_ORDER; else the single key.
export function statusCount (byStatus, sel) {
  if (sel === 'all') {
    return STATUS_ORDER.reduce((sum, k) => sum + byStatus[k], 0)
  }
  return byStatus[sel]
}

// The legs (completedRoundTrips) adjustment only applies where the displayed number
// includes completed requests: selection 'completed' or 'all'.
export function legsApply (sel, legs) {
  return !!legs && (sel === 'all' || sel === 'completed')
}

export function adjustedCount (entry, sel, legs) {
  const base = statusCount(entry.byStatus, sel)
  return base + (legsApply(sel, legs) ? (entry.completedRoundTrips ?? 0) : 0)
}

export function categoryChart (byCategory, sel, legs) {
  const rows = byCategory.map(entry => ({
    label: entry.category,
    value: adjustedCount(entry, sel, legs),
    color: CATEGORY_COLORS[entry.category],
  }))
  const total = rows.reduce((sum, r) => sum + r.value, 0)
  const withPct = rows.map(r => ({ ...r, pct: total > 0 ? r.value / total : 0 }))
  const slices = withPct
    .filter(r => r.value > 0)
    .map(({ label, value, color }) => ({ label, value, color }))
  return { slices, rows: withPct }
}

export function serviceChart (byServiceType, sel, cat, legs, otherPct = 0.02) {
  const filtered = cat === 'all'
    ? byServiceType
    : byServiceType.filter(e => e.category === cat)

  const withCount = filtered
    .map(entry => ({
      // Display label, not the domain value: custom serviceNames users type are
      // unmapped and fall through unchanged.
      label: SERVICE_LABELS[entry.serviceName] ?? entry.serviceName,
      value: adjustedCount(entry, sel, legs),
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))

  const total = withCount.reduce((sum, r) => sum + r.value, 0)

  // rows: every serviceName unrolled, no Other bucket.
  const rows = withCount.map(r => ({
    ...r,
    pct: total > 0 ? r.value / total : 0,
  }))

  // slices: entries under otherPct of the selected total merge into one Other slice.
  const threshold = total * otherPct
  const main = []
  let otherValue = 0
  withCount.forEach((r) => {
    if (total > 0 && r.value < threshold) {
      otherValue += r.value
    } else {
      main.push(r)
    }
  })

  const slices = main
    .filter(r => r.value > 0)
    .map((r, i) => ({ label: r.label, value: r.value, color: SERVICE_COLOR_RAMP[i % SERVICE_COLOR_RAMP.length] }))
  if (otherValue > 0) {
    slices.push({ label: 'Other', value: otherValue, color: OTHER_COLOR })
  }

  // rows carry no color (they're a text/legend listing keyed by serviceName); pair them
  // with the same ramp index ordering as slices would use is unnecessary — rows are unrolled
  // and don't participate in the Other merge, so give each its ramp color by position too.
  const rowsWithColor = rows.map((r, i) => ({ ...r, color: SERVICE_COLOR_RAMP[i % SERVICE_COLOR_RAMP.length] }))

  return { slices, rows: rowsWithColor }
}

export function outcomesChart (totals, legs) {
  const rows = OUTCOME_SPECS.map(spec => ({
    label: spec.label,
    value: totals.byStatus[spec.statusKey] + (spec.legs && legs ? (totals.completedRoundTrips ?? 0) : 0),
    color: spec.color,
  }))
  const total = rows.reduce((sum, r) => sum + r.value, 0)
  const withPct = rows.map(r => ({ ...r, pct: total > 0 ? r.value / total : 0 }))
  const slices = withPct
    .filter(r => r.value > 0)
    .map(({ label, value, color }) => ({ label, value, color }))
  return { slices, rows: withPct }
}

export function stripStats (metrics, legs) {
  const { totals } = metrics
  const legsBump = legs ? (totals.completedRoundTrips ?? 0) : 0

  const requests = totals.totalRequests + legsBump
  const completed = totals.byStatus.completed + legsBump
  // Neither of these includes completed requests, so the legs bump never applies.
  const unmatched = totals.byStatus.unmatched
  const cancelled = totals.byStatus.memberCancelled + totals.byStatus.volunteerCancelled

  return { requests, completed, unmatched, cancelled }
}
