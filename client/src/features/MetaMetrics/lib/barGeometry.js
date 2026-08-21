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
 * One array of drawable segments per row, in series order. `width` is a
 * PERCENTAGE in both views — see the denominator note above.
 *
 * A small village still renders as a sliver under `counts`, and that is the
 * finding rather than a rendering failure: the number in the adjacent column
 * carries the precision the bar cannot.
 *
 * @returns {Array<Array<{key,label,value,width,colorLight,colorDark}>>}
 */
export function barSegments (rows, series, view) {
  const isShare = view === 'share'

  // Scaled against the largest single SEGMENT, not the largest row total.
  // Counts draws the three outcomes as separate bars and never draws the total,
  // so scaling to a total nothing renders just wastes the right-hand end of the
  // track — the longest bar could only ever reach completed/total of it
  // (Barrington's 135 of 151). Against the max segment the longest bar is
  // exactly full width, and every comparison stays valid because it is still
  // one shared denominator.
  const maxSegment = rows.reduce(
    (max, row) => series.reduce((m, s) => Math.max(m, row[s.key]), max),
    0,
  )

  return rows.map(row => series.map(s => ({
    key: s.key,
    label: s.label,
    value: row[s.key],
    width: widthPct(row[s.key], isShare ? row.total : maxSegment, !isShare),
    colorLight: s.colorLight,
    colorDark: s.colorDark,
  })))
}
