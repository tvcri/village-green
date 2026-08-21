// Pixel geometry for the in-row bars of the Outcomes table.
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

// A fixed track, NOT a stretch-to-fill cell. Share bars are all 100% of
// something, so a percentage width would let them run to the page edge and make
// the two views occupy visibly different amounts of page. Pinning the track
// means a full Share bar is exactly as long as the largest Counts bar.
export const BAR_TRACK_PX = 260

// Sub-pixel values would disappear entirely at this scale — Wood River's 6
// cancelled against a hub max of 809 is 1.9px. A village that did something
// must not render as though it did nothing.
const MIN_VISIBLE_PX = 1

function pxWidth (value, denominator) {
  if (!denominator || value <= 0) return 0
  return Math.max(MIN_VISIBLE_PX, (value / denominator) * BAR_TRACK_PX)
}

// Share is expressed as a PERCENTAGE rather than pixels so the bar fills its
// cell whatever width the column ends up with. A fixed px track left a ragged
// gap at the right edge, which undercuts the one thing a share bar asserts —
// that this is the whole of this village. Counts keeps pixels because its
// lengths must be comparable ACROSS rows against a shared maximum, which a
// per-row percentage cannot express.
function pctWidth (value, total) {
  if (!total || value <= 0) return 0
  return (value / total) * 100
}

/**
 * One array of drawable segments per row, in series order.
 *
 * `counts` scales every row against the LARGEST row total, so bar lengths are
 * comparable between villages — that shared scale is the whole point, and it is
 * why a small village renders as a sliver. That is the finding, not a
 * rendering failure; the number in the adjacent column carries the precision.
 *
 * `share` scales each row against its OWN total, so every bar fills the track
 * and the segments read as proportions.
 *
 * @returns {Array<Array<{key,label,value,width,colorLight,colorDark}>>}
 */
export function barSegments (rows, series, view) {
  const isShare = view === 'share'
  const maxTotal = rows.reduce((max, r) => Math.max(max, r.total), 0)

  return rows.map(row => series.map(s => ({
    key: s.key,
    label: s.label,
    value: row[s.key],
    width: isShare
      ? pctWidth(row[s.key], row.total)
      : pxWidth(row[s.key], maxTotal),
    // The consumer cannot infer this from the number alone, and getting it
    // wrong silently renders a 57 as 57px instead of 57%.
    unit: isShare ? '%' : 'px',
    colorLight: s.colorLight,
    colorDark: s.colorDark,
  })))
}
