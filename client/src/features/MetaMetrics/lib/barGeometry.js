// Bar widths for the in-row bars of the meta metrics tables.
//
// This page draws no chart. A Chart.js canvas was built first and rejected on
// sight against real data: it forced constant scrolling between a chart and the
// table explaining it, and nothing structurally kept a bar on the same line as
// its own numbers. The bar is now a table COLUMN — see the 2026-08-21 amendment
// at the top of the presentation spec, and the report it is modelled on at
// ~/dev/tvcri/vg-utils/district-report/.
//
// Pure and DOM-free, like every other lib here: the PDF export draws its own
// table and needs these widths as plain numbers.

// ALL THREE TABS STACK, in both views. An earlier design grouped the Outcomes
// tab in counts — three separate bars sharing one scale — on the reasoning that
// the three outcomes do not compose into a whole. That was wrong: every request
// has exactly one terminal fate, so completed + cancelled + unmatched IS the
// village's request count, and a partition is exactly what a stacked bar draws.
// The summary strip had been asserting that composition all along, stating each
// outcome as a percentage of the total. Grouping also made Outcomes the only
// tab whose bars changed shape between views.
//
// The two views differ in their DENOMINATOR, not their unit. Segments are
// always proportions of their own row; it is the TRACK that carries magnitude:
//   percent — every track is full width, so each bar reads as parts of 100%.
//   counts  — the track is scaled against the busiest village's total, so the
//             one mark shows both how much work a village does and what kind.
//
// COUNTS ONLY: a floor keeps a nonzero TRACK visible, so a village that did a
// little work does not render as a village that did none. Segments are never
// floored, in either view — they must sum to exactly their track, and inflating
// one would push the row past its own end (a row once measured 100.35%).
//
// A segment too small to see is left too small to see, deliberately. The two
// views exist because neither is adequate alone: if a sliver disappears in
// counts, percent is the view that resolves it, and floors that fake visibility
// would only misstate it in both.
const MIN_VISIBLE_PCT = 0.6

function widthPct (value, denominator, floor) {
  if (!denominator || value <= 0) return 0
  const pct = (value / denominator) * 100
  return floor ? Math.max(MIN_VISIBLE_PCT, pct) : pct
}

/**
 * One array of drawable segments per row, in series order, plus how wide each
 * row's whole track is. `width` and `trackPct` are both PERCENTAGES.
 *
 * A quiet village still renders as a short bar under `counts`, and that is the
 * finding rather than a rendering failure: the number in the adjacent column
 * carries the precision the bar cannot.
 *
 * @returns {{segments: Array<Array<object>>, trackPct: number[]}}
 */
export function barSegments (rows, series, view) {
  const isShare = view === 'percent'

  // The busiest village's total sets the scale in counts. Screen and PDF both
  // call this function, so the two cannot disagree about it — the PDF once
  // hardcoded its own copy of the layout rule and drew percent view grouped.
  const maxTotal = rows.reduce((max, row) => Math.max(max, row.total), 0)

  const segments = rows.map(row => series.map(s => ({
    key: s.key,
    label: s.label,
    value: row[s.key],
    // Never floored: the segments must sum to exactly 100% of their track.
    width: widthPct(row[s.key], row.total, false),
    colorLight: s.colorLight,
    colorDark: s.colorDark,
  })))

  // Full width in percent — a share bar asserts "this is the whole of this
  // village", and one that stops short of its container undercuts that.
  const trackPct = rows.map(row => (
    isShare ? 100 : widthPct(row.total, maxTotal, true)
  ))

  return { segments, trackPct }
}
