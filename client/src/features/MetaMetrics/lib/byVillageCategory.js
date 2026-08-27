// Villages down, service categories across — the reduction behind the
// Categories tab.
//
// Distinct from `byCategory` in reduceCells.js, which collapses villages away
// to give hub-wide category totals. This page compares villages, so the village
// stays the row and the four categories become the series.

import { CATEGORY_ORDER } from './reduceCells.js'

// Hues match CATEGORY_COLORS in VillageMetrics' metricsView.js, so a category
// is the same color wherever it appears in the product. Those are light-theme
// values; the dark steps are selected to sit in the same lightness band against
// the dark surface rather than being mechanical lightenings.
//
// NOTE these are NOT the CVD-validated blue/orange/purple of STATUS_SERIES.
// That palette was chosen because completed-vs-cancelled is the contrast those
// charts encode and it had to survive protanopia. Category identity is a weaker
// requirement — the numbers sit in labelled columns beside the bar — and
// matching the rest of the product matters more here.
//
// `shortLabel` is the on-screen column header only. Without it "Home Help" and
// "Tech Support" wrap to two lines while "Rides" and "Errands" sit on one, so
// the header row is taller than any of them needs. The audience for this page
// is federation staff, for whom "Home" and "Tech" are unambiguous; the full
// label still names the bar segment and the CSV column.
const CATEGORY_STYLES = {
  Rides: { colorLight: '#22c55e', colorDark: '#4ade80' },
  Errands: { colorLight: '#f59e0b', colorDark: '#fbbf24' },
  'Home Help': { colorLight: '#3b82f6', colorDark: '#60a5fa', shortLabel: 'Home' },
  'Tech Support': { colorLight: '#8b5cf6', colorDark: '#a78bfa', shortLabel: 'Tech' },
}

// A safety net for a category added to CATEGORY_ORDER without a style here: it
// would otherwise spread to `undefined` colors and render as an INVISIBLE bar
// segment — a silent failure. This gives it a visible neutral grey and says so,
// loudly, in the console.
//
// The vocabulary is not expected to grow (Friends work is not a service request
// and gets its own presentation — see CATEGORY_ORDER in reduceCells.js), so this
// guards a developer mistake rather than an anticipated addition.
const FALLBACK_STYLE = { colorLight: '#64748b', colorDark: '#94a3b8' }

export function buildCategorySeries (order) {
  return order.map(key => {
    const style = CATEGORY_STYLES[key]
    if (!style && typeof console !== 'undefined') {
      console.warn(
        `[MetaMetrics] No color defined for service category "${key}". ` +
        'Add one to CATEGORY_STYLES in byVillageCategory.js — it is rendering grey.',
      )
    }
    return { key, label: key, ...(style ?? FALLBACK_STYLE) }
  })
}

export const CATEGORY_SERIES = buildCategorySeries(CATEGORY_ORDER)

/**
 * One row per village in `villages`, carrying a completed-request count for
 * each of the four categories plus a row `total`.
 *
 * COMPLETED ONLY, deliberately. A category bar answers "what work does this
 * village actually do", so counting cancelled or unmatched requests would
 * inflate it with work that never happened. The Outcomes tab is where the
 * fate of a request is the subject.
 *
 * @returns {Array<{villageId, villageName, Rides, Errands, 'Home Help', 'Tech Support', total}>}
 */
export function byVillageCategory (cells, villages, { legs = false } = {}) {
  const blank = v => {
    const row = { villageId: v.villageId, villageName: v.villageName, total: 0 }
    // Zero-filled so every village has every category: a missing key would
    // render as an undefined-width segment rather than an absent one.
    for (const s of CATEGORY_SERIES) row[s.key] = 0
    return row
  }

  const rows = new Map(villages.map(v => [v.villageId, blank(v)]))

  for (const cell of cells) {
    const row = rows.get(cell.villageId)
    // A serviceName matching no category prefix is excluded rather than
    // bucketed — inventing a fifth category would be a lie about the data.
    if (!row || cell.category === null || !(cell.category in row)) continue

    const bump = legs ? cell.completedRoundTrips : 0
    const value = cell.byStatus.completed + bump
    row[cell.category] += value
    row.total += value
  }

  return [...rows.values()]
}
