// Villages down, the service names WITHIN ONE CATEGORY across — the reduction
// behind the Detail tab.
//
// Why one category at a time: there are ten serviceName values across four
// categories, and a table of all ten is 130 cells nobody reads. Scoped to a
// category the table is at most seven columns (village, five services, total)
// because Rides — the largest — has five. The category selector is REQUIRED and
// offers no "all": the explosion cannot be requested because the UI does not
// offer it.

// Mirrors SERVICE_COLOR_RAMP in VillageMetrics' metricsView.js, so a service
// drilldown looks the same in both places. Unlike the category palette these
// hues carry no fixed meaning — a service's colour is positional, assigned by
// rank within its category, because the vocabulary is open-ended.
const SERVICE_RAMP = [
  { colorLight: '#0ea5e9', colorDark: '#38bdf8' },
  { colorLight: '#22c55e', colorDark: '#4ade80' },
  { colorLight: '#f59e0b', colorDark: '#fbbf24' },
  { colorLight: '#8b5cf6', colorDark: '#a78bfa' },
  { colorLight: '#ec4899', colorDark: '#f472b6' },
  { colorLight: '#14b8a6', colorDark: '#2dd4bf' },
  { colorLight: '#f97316', colorDark: '#fb923c' },
  { colorLight: '#64748b', colorDark: '#94a3b8' },
]

// 'Ride: Medical Appnt' -> 'Medical Appnt'. The tab already names the category
// in its selector, so repeating it in every column header wastes the width the
// drilldown exists to reclaim. A name with no prefix (Home Help's
// 'Household Chores/Handy Help') is left whole.
function shortServiceName (serviceName, category) {
  const [head, ...rest] = serviceName.split(':')
  return rest.length && head.trim() === category.replace(/s$/, '')
    ? rest.join(':').trim()
    : serviceName
}

/**
 * The categories worth drilling into: those with more than one service in the
 * data. Derived rather than hardcoded, so a new category appears the moment it
 * has a second service — the customer expects to split Friends into visits,
 * calls and texts once they start recording it.
 *
 * Home Help and Tech Support have exactly one service each today, so drilling
 * into them would show a single column identical to the row total.
 */
export function drilldownCategories (cells) {
  const byCategory = new Map()
  for (const cell of cells) {
    if (cell.category === null) continue
    if (!byCategory.has(cell.category)) byCategory.set(cell.category, new Set())
    byCategory.get(cell.category).add(cell.serviceName)
  }
  return [...byCategory.entries()]
    .filter(([, names]) => names.size > 1)
    .map(([category]) => category)
    .sort((a, b) => a.localeCompare(b))
}

// Header-only abbreviations, keyed by full service name. Without them
// "Medical Appnt" and "Personal Care" wrap their column headers onto two lines
// while "Shopping" and "Other" sit on one, making the header row taller than
// any of them needs. These are the customer's own shorthand for the services;
// the full prefix-stripped label still names the bar segment and the CSV column.
//
// Keyed by the FULL name rather than the stripped one so a future
// "Friends: Personal Care" could not accidentally inherit a ride's shorthand.
const SERVICE_SHORT_LABELS = {
  'Ride: Medical Appnt': 'Medical',
  'Ride: Activity/Event': 'Activity',
  'Ride: Personal Care': 'Personal',
  'Errand: Pick up/delivery': 'Pickup',
}

/**
 * The drawable series for one category: its service names, busiest first, each
 * carrying a ramp colour, a prefix-stripped label, and — where the label is
 * long enough to wrap a header — a shortLabel.
 */
export function serviceSeries (cells, category) {
  const totals = new Map()
  for (const cell of cells) {
    if (cell.category !== category) continue
    const prior = totals.get(cell.serviceName) ?? 0
    totals.set(cell.serviceName, prior + cell.byStatus.completed)
  }

  return [...totals.entries()]
    // Busiest first so the ramp's strongest hue lands on the dominant service
    // and the column order matches the bar's segment order.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([serviceName], i) => {
      const short = SERVICE_SHORT_LABELS[serviceName]
      return {
        key: serviceName,
        label: shortServiceName(serviceName, category),
        ...(short ? { shortLabel: short } : {}),
        ...SERVICE_RAMP[i % SERVICE_RAMP.length],
      }
    })
}

/**
 * One row per village, carrying a completed-request count for each service in
 * `category` plus a row `total`.
 *
 * COMPLETED ONLY, matching the Categories tab: the bar answers "what work does
 * this village do", so cancelled and unmatched requests would inflate it with
 * work that never happened.
 */
export function byVillageService (cells, villages, category, { legs = false } = {}) {
  const series = serviceSeries(cells, category)

  const rows = new Map(villages.map(v => {
    const row = { villageId: v.villageId, villageName: v.villageName, total: 0 }
    // Zero-filled: a village that has never provided one of this category's
    // services must render an absent segment, not an undefined-width one.
    for (const s of series) row[s.key] = 0
    return [v.villageId, row]
  }))

  for (const cell of cells) {
    if (cell.category !== category) continue
    const row = rows.get(cell.villageId)
    if (!row || !(cell.serviceName in row)) continue

    const value = cell.byStatus.completed + (legs ? cell.completedRoundTrips : 0)
    row[cell.serviceName] += value
    row.total += value
  }

  return [...rows.values()]
}
