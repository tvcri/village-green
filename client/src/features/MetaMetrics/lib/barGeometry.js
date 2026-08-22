// Bar widths for the in-row bars of the Outcomes table.
//
// This page draws no chart. A Chart.js canvas was built first and rejected on
// sight against real data: it forced constant scrolling between a chart and the
// table explaining it, and nothing structurally kept a bar on the same line as
// its own numbers. The bar is now a table COLUMN — see the 2026-08-21 amendment
// at the top of the presentation spec, and the report it is modelled on at
// ~/dev/tvcri/vg-utils/district-report/.
//
// Pure and DOM-free, like every other lib here: the deferred PDF export draws
// its own table and needs these widths as plain numbers.

// BOTH views are expressed as percentages so the bars fill whatever width the
// column ends up with. An earlier fixed-pixel track left a widening gap at the
// right-hand end as the numeric columns were tightened — the bars stopped short
// of their container for no reason a reader could see.
//
// The two views differ in their DENOMINATOR, not their unit:
//   share  — each row against its OWN total, so every bar fills the track and
//            the segments read as parts of 100%.
//   counts — every row against the largest single SEGMENT on the page, so the
//            longest bar is exactly full width and all lengths stay comparable
//            across rows.
//
// COUNTS ONLY: a floor keeps a nonzero value visible. A 1-request outcome
// against a 135 maximum is 0.7% of the track, which rounds away to nothing, and
// a village that did something must not render as though it did nothing.
//
// Share deliberately does NOT floor. Its segments are the parts of one whole,
// so inflating a small one both overstates it and pushes the row past 100% —
// the bar would overflow its own container. Share needs no floor anyway: a
// percentage of a row's own total is far larger than the same value measured
// against the page's maximum.
const MIN_VISIBLE_PCT = 0.6

function widthPct (value, denominator, floor) {
  if (!denominator || value <= 0) return 0
  const pct = (value / denominator) * 100
  return floor ? Math.max(MIN_VISIBLE_PCT, pct) : pct
}

/**
 * Whether a bar draws as one composed mark or as separate bars.
 *
 * Outcomes asks for 'grouped' because its three series do not compose into a
 * whole — but ONLY in counts view. In share every bar is parts of 100%, which
 * is a composition by definition, so share always stacks whatever the tab asked
 * for. Screen and PDF both go through here so the two cannot disagree; the PDF
 * once hardcoded its own version of this rule and rendered share as grouped.
 */
export function isStackedLayout (layout, view) {
  return layout === 'stacked' || view === 'percent'
}

/**
 * One array of drawable segments per row, in series order, plus how wide each
 * row's whole track is. `width` and `trackPct` are both PERCENTAGES.
 *
 * A small village still renders as a sliver under `counts`, and that is the
 * finding rather than a rendering failure: the number in the adjacent column
 * carries the precision the bar cannot.
 *
 * @returns {{segments: Array<Array<object>>, trackPct: number[]}}
 */
export function barSegments (rows, series, view, { layout = 'grouped' } = {}) {
  const isShare = view === 'percent'
  const isStacked = isStackedLayout(layout, view)

  // GROUPED (Outcomes): scaled against the largest single SEGMENT, not the
  // largest row total. Counts draws the outcomes as separate bars and never
  // draws a total, so scaling to a total nothing renders would just waste the
  // right-hand end — the longest bar could only reach completed/total of it
  // (Barrington's 135 of 151). Against the max segment the longest bar is
  // exactly full width and every comparison stays valid, because it is still
  // one shared denominator.
  const maxSegment = rows.reduce(
    (max, row) => series.reduce((m, s) => Math.max(m, row[s.key]), max),
    0,
  )

  // STACKED (Categories): the segments are always proportions of their own row,
  // and it is the TRACK that carries magnitude — full width in share, scaled to
  // the busiest village in counts. That split is what lets one mark show both
  // how much work a village does and what kind.
  const maxTotal = rows.reduce((max, row) => Math.max(max, row.total), 0)

  const segments = rows.map(row => series.map(s => ({
    key: s.key,
    label: s.label,
    value: row[s.key],
    width: isStacked
      // No floor when stacked: the segments must sum to exactly 100% of their
      // track, and inflating a small one would push the row past its own end.
      ? widthPct(row[s.key], row.total, false)
      : widthPct(row[s.key], isShare ? row.total : maxSegment, !isShare),
    colorLight: s.colorLight,
    colorDark: s.colorDark,
  })))

  // How wide the whole bar is, as a percentage of the cell. Grouped bars own
  // their own widths per segment, so their track is always the full cell.
  const trackPct = rows.map(row => {
    if (!isStacked || isShare) return 100
    return widthPct(row.total, maxTotal, true)
  })

  return { segments, trackPct }
}
