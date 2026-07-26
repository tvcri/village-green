// Avery 5160 geometry, US Letter, 72 points per inch.
// Confirmed with the customer 2026-07-20.
//
// A second Avery format is a new constants object here, not a rewrite —
// cellOrigin reads AVERY_5160 rather than hardcoding numbers.
//
// Text is inset from the cell edge because Avery's own templates inset:
// rendering at the exact cell boundary looks wrong even when geometry is
// correct.

export const PAGE = { width: 612, height: 792 } // 8.5in x 11in

export const AVERY_5160 = {
  labelWidth: 189, // 2.625in
  labelHeight: 72, // 1in
  columns: 3,
  rows: 10,
  marginTop: 36, // 0.5in
  marginLeft: 13.5, // 0.1875in
  pitchX: 198, // 2.75in — exceeds labelWidth by 9pt: the column gutter
  pitchY: 72, // 1in — rows are contiguous, no vertical gap
  inset: 11, // ~0.15in
}

export const LABELS_PER_SHEET = AVERY_5160.columns * AVERY_5160.rows

// First text line's draw position in PDF coordinates (origin bottom-left).
// index is 0-based within a sheet, row-major: left to right, then down —
// matching how a human counts labels on a sheet. Positive nudgeY = down the
// page (the intuitive direction when standing at a printer), which is -y in
// PDF space.
export function cellOrigin (index, { nudgeX = 0, nudgeY = 0 } = {}) {
  const g = AVERY_5160
  const col = index % g.columns
  const row = Math.floor(index / g.columns)

  const fromLeft = g.marginLeft + col * g.pitchX + g.inset + nudgeX
  const fromTop = g.marginTop + row * g.pitchY + g.inset + nudgeY

  return { x: fromLeft, y: PAGE.height - fromTop }
}

export function usableTextWidth () {
  return AVERY_5160.labelWidth - 2 * AVERY_5160.inset
}
