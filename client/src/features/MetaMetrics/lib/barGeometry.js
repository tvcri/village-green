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

function widthFor (value, denominator) {
  if (!denominator || value <= 0) return 0
  return Math.max(MIN_VISIBLE_PX, (value / denominator) * BAR_TRACK_PX)
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
  const maxTotal = rows.reduce((max, r) => Math.max(max, r.total), 0)

  return rows.map(row => {
    const denominator = view === 'share' ? row.total : maxTotal
    return series.map(s => ({
      key: s.key,
      label: s.label,
      value: row[s.key],
      width: widthFor(row[s.key], denominator),
      colorLight: s.colorLight,
      colorDark: s.colorDark,
    }))
  })
}
