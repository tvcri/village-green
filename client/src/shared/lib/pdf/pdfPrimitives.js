// Drawing primitives and page geometry shared by the PDF exports.
//
// Extracted from VillageMetrics' metricsPdf.js when Meta Metrics gained its own
// document. `buildMetricsPdf` stayed there — it IS the village report, with a
// fixed section order and village-specific fields — but everything below is
// generic: page size, palette, text placement, a rounded frame, civil-date
// formatting, and the WinAnsi guard.

import { rgb } from 'pdf-lib'

// US Letter at 72dpi, with a margin that leaves a comfortable measure.
export const PAGE_W = 612
export const PAGE_H = 792
export const MARGIN = 54

export const INK = rgb(0.09, 0.09, 0.11)
export const MUTED = rgb(0.42, 0.45, 0.5)
export const LINE = rgb(0.9, 0.91, 0.92)
// One step darker than LINE. The hairline LINE reads fine on a screen but can
// nearly vanish on a laser printer, and these are documents people print.
export const BORDER = rgb(0.82, 0.84, 0.86)
// Barely-there card fill (#f9fafb).
export const TINT = rgb(0.976, 0.980, 0.985)

export const CARD_RADIUS = 8

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// 'YYYY-MM-DD' -> 'January 1, 2026'. Splits the string rather than going
// through a JS Date: these are civil calendar values, and 'YYYY-MM-DD' parses
// as UTC midnight, which lands on the previous day in western zones. Filenames
// stay ISO — only the human-facing header is reformatted.
export function formatCivil (s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''))
  if (!m) return String(s ?? '')
  const [, y, mo, d] = m
  const month = MONTHS[Number(mo) - 1]
  return month ? `${month} ${Number(d)}, ${y}` : String(s)
}

// Collapses a shared year to one mention: 'January 1 – July 30, 2026' rather
// than repeating 2026 on both sides. Falls back to two full dates whenever the
// years differ or either value is not a civil date.
export function formatRange (start, end) {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(start ?? ''))
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(end ?? ''))
  if (!a || !b) return `${formatCivil(start)} – ${formatCivil(end)}`
  if (a[1] === b[1]) {
    const ma = MONTHS[Number(a[2]) - 1]
    const mb = MONTHS[Number(b[2]) - 1]
    if (ma && mb) return `${ma} ${Number(a[3])} – ${mb} ${Number(b[3])}, ${Number(b[1])}`
  }
  return `${formatCivil(start)} – ${formatCivil(end)}`
}

function isEncodable (s, font) {
  try {
    font.widthOfTextAtSize(s, 12)
    return true
  } catch {
    return false
  }
}

// The standard PDF fonts are WinAnsi-encoded and pdf-lib throws on anything
// outside it. Asks the font itself what it can encode rather than keeping a
// hand-maintained character table.
//
// KNOWN LIMITATION: an unencodable character degrades to '?' rather than being
// NFKD-decomposed, so 'José' would render 'Jos?' instead of 'Jose'. Village and
// service names are all ASCII, and the meta document contains no person names
// at all; the village report's People section is where this could bite.
export function winAnsi (text, font) {
  const s = String(text ?? '')
  if (isEncodable(s, font)) return s

  let out = ''
  for (const ch of s) out += isEncodable(ch, font) ? ch : '?'
  return out
}

export function hexColor (hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '')
  if (!m) return MUTED
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255)
}

export function drawText (page, text, x, y, size, font, color) {
  page.drawText(winAnsi(text, font), { x, y, size, font, color })
}

export function rightText (page, text, rightX, y, size, font, color) {
  const s = winAnsi(text, font)
  page.drawText(s, { x: rightX - font.widthOfTextAtSize(s, size), y, size, font, color })
}

// A card frame. pdf-lib's drawRectangle has no borderRadius, so this is an SVG
// path — and drawSvgPath anchors SVG-style at the top-left with +y pointing
// DOWN, unlike every other pdf-lib call. The path is therefore authored in
// local coordinates from (0,0) and anchored at the card's TOP-left (x, y): h is
// added going down, not subtracted. Getting this backwards draws the frame
// mirrored off the content.
export function roundedRect (page, { x, y, w, h, r = CARD_RADIUS, fill = TINT }) {
  const d = [
    `M ${r} 0`,
    `L ${w - r} 0`, `Q ${w} 0 ${w} ${r}`,
    `L ${w} ${h - r}`, `Q ${w} ${h} ${w - r} ${h}`,
    `L ${r} ${h}`, `Q 0 ${h} 0 ${h - r}`,
    `L 0 ${r}`, `Q 0 0 ${r} 0`, 'Z',
  ].join(' ')
  page.drawSvgPath(d, { x, y, borderColor: BORDER, borderWidth: 1, color: fill })
}
