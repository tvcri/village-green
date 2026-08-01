// Assembles the Village Metrics PDF. Takes already-captured pie images plus row
// data and returns bytes — no DOM, no Vue, no canvas, so it is unit-testable.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 54

const INK = rgb(0.09, 0.09, 0.11)
const MUTED = rgb(0.42, 0.45, 0.5)
const LINE = rgb(0.9, 0.91, 0.92)
// One step darker than LINE. The hairline LINE reads fine on a screen but can
// nearly vanish on a laser printer, and this is a document people print.
const BORDER = rgb(0.82, 0.84, 0.86)
// Barely-there card fill (#f9fafb).
const TINT = rgb(0.976, 0.980, 0.985)

// Smaller than the unframed layout's 200 so the pie sits inside CARD_PAD
// without crowding the card border.
// Exported so the capture step can render at this width's aspect ratio — a
// canvas whose proportions differ from the draw box gets squashed by pdf-lib.
export const PIE_SIZE = 170

// A horizontal bar chart spends its width on y-axis labels before it draws any
// bar at all: at PIE_SIZE the Services chart had ~110pt of bar left after
// "Ride: Activity/Event". The legend can afford the difference — its three
// columns leave visible slack at PIE_SIZE — so bar mode takes a wider slot.
export const BAR_WIDTH = 250

// Width of the chart slot for a given mode. The legend takes whatever is left,
// so this is the single number that trades one against the other.
export function chartSlotWidth (chartType) {
  return chartType === 'bar' ? BAR_WIDTH : PIE_SIZE
}
const ROW_H = 15

const CARD_PAD = 14
const CARD_RADIUS = 8
// Title row inside a card: heading baseline plus the gap to the content below.
const CARD_TITLE_H = 24
// Vertical gap between stacked cards.
const CARD_GAP = 20
const STAT_CARD_H = 52

// Baseline the footer text is drawn at (see `footer` in buildMetricsPdf).
// Nothing else may draw at or below this y.
const FOOTER_Y = MARGIN - 18
// "People" heading + its subtitle, drawn once above both columns.
const PEOPLE_HEADING_H = 40

export const PEOPLE_LIMIT = 20

const STATUS_TEXT = {
  all: 'All statuses',
  completed: 'Completed',
  unmatched: 'Unmatched',
  memberCancelled: 'Member cancelled',
  volunteerCancelled: 'Volunteer cancelled',
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// 'YYYY-MM-DD' -> 'January 1, 2026'. Splits the string rather than going
// through a JS Date: these are civil calendar values, and 'YYYY-MM-DD' parses
// as UTC midnight, which lands on the previous day in western zones. The
// filenames stay ISO — only the human-facing header is reformatted.
// Anything that isn't a well-formed civil date is passed through untouched.
export function formatCivil (s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''))
  if (!m) return String(s ?? '')
  const month = MONTHS[Number(m[2]) - 1]
  if (!month) return String(s)
  return `${month} ${Number(m[3])}, ${Number(m[1])}`
}

// "January 1 – July 30, 2026" when both ends share a year, otherwise the two
// full dates. En dash (U+2013) is the range convention and encodes in WinAnsi.
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

// Standard Helvetica encodes WinAnsi only; one character outside it makes
// drawText throw and kills the whole document. WinAnsi is much wider than
// printable ASCII (it covers em dash, middle dot, precomposed Latin-1
// accents like "ë", etc.), so pdf-lib's own encoder is used as the sole
// authority on what's encodable — no hand-maintained character table.
// Same guard generateLabelPdf uses.
export function winAnsi (text, font) {
  const s = String(text ?? '')
  if (isEncodable(s, font)) return s

  let out = ''
  for (const ch of s) out += isEncodable(ch, font) ? ch : '?'
  return out
}

function isEncodable (s, font) {
  try {
    font.widthOfTextAtSize(s, 12)
    return true
  } catch {
    return false
  }
}

function hexColor (hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '')
  if (!m) return MUTED
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255)
}

export function topN (rows, limit) {
  return [...rows].sort((a, b) => b.count - a.count).slice(0, limit)
}

// Truncation is REPORTED, never silent.
export function peopleFooter (shown, total, noun) {
  return shown < total
    ? `Showing top ${shown} of ${total} ${noun} by completed requests.`
    : `Showing all ${total} ${noun} by completed requests.`
}

function drawText (page, text, x, y, size, font, color) {
  page.drawText(winAnsi(text, font), { x, y, size, font, color })
}

function rightText (page, text, rightX, y, size, font, color) {
  const s = winAnsi(text, font)
  page.drawText(s, { x: rightX - font.widthOfTextAtSize(s, size), y, size, font, color })
}

// A card frame. pdf-lib's drawRectangle has no borderRadius, so this is an SVG
// path — and drawSvgPath anchors SVG-style at the top-left with +y pointing
// DOWN, unlike every other pdf-lib call in this file. The path is therefore
// authored in local coordinates from (0,0) and anchored at the card's TOP-left
// (x, y): h is added going down, not subtracted. Getting this backwards draws
// the frame mirrored off the content — which is exactly what happened first try.
function roundedRect (page, { x, y, w, h, r = CARD_RADIUS, fill = TINT }) {
  const d = [
    `M ${r} 0`,
    `L ${w - r} 0`, `Q ${w} 0 ${w} ${r}`,
    `L ${w} ${h - r}`, `Q ${w} ${h} ${w - r} ${h}`,
    `L ${r} ${h}`, `Q 0 ${h} 0 ${h - r}`,
    `L 0 ${r}`, `Q 0 0 ${r} 0`, 'Z',
  ].join(' ')
  page.drawSvgPath(d, { x, y, borderColor: BORDER, borderWidth: 1, color: fill })
}

// What drawLegend consumes vertically: 6 (header -> rule) + 14 (rule -> first
// row) + rows*ROW_H, plus the Total line (2 + ROW_H) when there are any rows.
// Tracks the cy walk in drawLegend — keep the two in step.
function legendHeight (rows) {
  return 20 + rows.length * ROW_H + (rows.length ? ROW_H + 2 : 0)
}

// Legend table drawn as TEXT, not baked into the image, so it stays selectable
// and searchable in the finished PDF.
// Gap between the right-aligned Value and Pct columns. Both are narrow (3-4
// digits, and "100%" at most), so a wide gap just strands whitespace between
// them while the Label column — which carries "Ride: Activity/Event" — has
// none to spare. The Total row reads the same valueX, so it tracks this.
const VALUE_PCT_GAP = 44

// Legend table drawn as TEXT, not baked into the image, so it stays selectable
// and searchable in the finished PDF.
function drawLegend (page, fonts, rows, x, y, width) {
  const { helv, bold } = fonts
  const valueX = x + width - VALUE_PCT_GAP
  const pctX = x + width
  let cy = y

  drawText(page, 'Label', x + 18, cy, 9, bold, MUTED)
  rightText(page, 'Value', valueX, cy, 9, bold, MUTED)
  rightText(page, 'Pct', pctX, cy, 9, bold, MUTED)
  cy -= 6
  page.drawLine({ start: { x, y: cy }, end: { x: x + width, y: cy }, thickness: 1, color: LINE })
  cy -= 14

  // No per-row rules. A 0.5pt rule at cy+9 lands exactly on the top edge of the
  // 9pt color chip, so it clipped the chip instead of separating rows — and
  // inside a card frame the stack of hairlines read as noise. Row spacing plus
  // the aligned chips carry the separation on their own.
  let total = 0
  for (const r of rows) {
    total += r.value
    page.drawRectangle({ x, y: cy - 1, width: 9, height: 9, color: hexColor(r.color) })
    drawText(page, r.label, x + 18, cy, 10, helv, INK)
    rightText(page, String(r.value), valueX, cy, 10, helv, INK)
    rightText(page, `${Math.round((r.pct ?? 0) * 100)}%`, pctX, cy, 10, helv, INK)
    cy -= ROW_H
  }

  if (rows.length > 0) {
    // The one rule that earns its place: it separates the data from the Total.
    cy += 3
    page.drawLine({ start: { x, y: cy }, end: { x: x + width, y: cy }, thickness: 1, color: LINE })
    cy -= 14
    drawText(page, 'Total', x + 18, cy, 10, bold, INK)
    rightText(page, String(total), valueX, cy, 10, bold, INK)
    cy -= ROW_H
  }
  return cy
}

// Bar geometry, mirroring the on-screen card (BAR_THICKNESS/BAR_CHART_PADDING
// in MetricsPieCard.vue) but in points rather than CSS pixels. The padding
// covers the x-axis, its labels, and a little breathing room.
const PDF_BAR_THICKNESS = 22
const PDF_BAR_PADDING = 42

// Height of the drawn CHART. A pie is square, so PIE_SIZE. A bar chart sizes
// to its own bar count, which keeps bar thickness consistent across sections:
// stretching a 3-bar Outcomes chart to fill a legend-sized card drew 40pt bars
// next to Services' 15pt ones — same page, same units, incomparable weights.
//
// Depends only on its own inputs, never on the card, so chartContentHeight can
// depend on THIS without the two becoming circular.
export function chartDrawHeight (sliceCount, chartType) {
  if (chartType !== 'bar') return PIE_SIZE
  return sliceCount * PDF_BAR_THICKNESS + PDF_BAR_PADDING
}

// Content height inside a chart CARD — the taller of the chart and its legend,
// so neither is clipped and the card fits whichever needs the room.
//
// The PIE_SIZE floor lives in chartDrawHeight now rather than here. It exists
// so a PIE card is never shorter than its square image; applying it in bar
// mode left a 108pt chart and a 90pt legend inside a 170pt card, padding every
// short section with whitespace it had no use for.
export function chartContentHeight (rows, sliceCount, chartType) {
  return Math.max(chartDrawHeight(sliceCount, chartType), legendHeight(rows))
}

// Height a framed chart section occupies, so callers can fits-check before drawing.
function pieSectionHeight (view) {
  return chartContentHeight(view.rows, view.sliceCount, view.chartType) + CARD_PAD * 2 + CARD_TITLE_H
}

// One chart + its legend side by side inside a rounded card, mirroring the
// on-screen .pie-card. Returns the y a following section may start at.
async function drawPieSection (pdf, page, fonts, title, subtitle, image, view, y) {
  const { helv, bold } = fonts
  const cardH = pieSectionHeight(view)
  const cardW = PAGE_W - MARGIN * 2

  roundedRect(page, { x: MARGIN, y, w: cardW, h: cardH })

  let inner = y - CARD_PAD
  drawText(page, title, MARGIN + CARD_PAD, inner - 12, 13, bold, INK)
  if (subtitle) drawText(page, subtitle, MARGIN + CARD_PAD + 110, inner - 11, 9.5, helv, MUTED)
  inner -= CARD_TITLE_H

  const pieX = MARGIN + CARD_PAD
  const slotW = chartSlotWidth(view.chartType)
  if (image) {
    const png = await pdf.embedPng(image)
    // A pie draws as a PIE_SIZE square; a bar chart takes a wider slot and a
    // height set by its bar count. Top-aligned from `inner`, so a chart shorter
    // than the card leaves its slack at the bottom rather than stretching.
    // The CARD height is unchanged either way, so pagination is untouched.
    const imgH = chartDrawHeight(view.sliceCount, view.chartType)
    page.drawImage(png, { x: pieX, y: inner - imgH, width: slotW, height: imgH })
  } else {
    drawText(page, view.emptyMessage, pieX, inner - PIE_SIZE / 2, 10, helv, MUTED)
  }

  const legendX = pieX + slotW + 24
  const legendW = PAGE_W - MARGIN - CARD_PAD - legendX
  drawLegend(page, fonts, view.rows, legendX, inner - 6, legendW)

  return y - cardH - CARD_GAP
}

// Height (in pt) a single People column needs, from the section "People"
// heading (shared above both columns) down past its truncation footer line.
// drawPeopleTable's own fixed chrome measures 44pt (18 heading -> column
// header, then 6 + 14 rule/first-row offset, then 6 to the footer line); this
// budgets 82pt so the fits-check keeps ~38pt of slack. The overestimate is
// deliberate and one-directional: it can only spill People to a fresh page
// slightly sooner than strictly necessary, never let it overlap the footer.
// Keep it conservative — do NOT "correct" it down to the measured 44.
function peopleColumnHeight (rowCount) {
  return 18 + 38 + rowCount * 13 + 26 + CARD_PAD * 2
}

// Required height for the whole People section — its own "People" heading
// plus the two-column block below, sized by whichever column is taller (the
// two row counts can differ). This is what a fits-check compares against
// remaining page space.
function peopleSectionHeight (report) {
  const shownMembers = Math.min(report.people.members.length, PEOPLE_LIMIT)
  const shownVolunteers = Math.min(report.people.volunteers.length, PEOPLE_LIMIT)
  const colH = Math.max(peopleColumnHeight(shownMembers), peopleColumnHeight(shownVolunteers))
  return PEOPLE_HEADING_H + colH
}

// Draws the "People" heading and both columns (Members left, Volunteers
// right) starting at the given y. Caller is responsible for having already
// verified (via peopleSectionHeight) that it fits above the footer.
function drawPeopleSection (page, fonts, report, y) {
  const { helv, bold } = fonts
  const colW = (PAGE_W - MARGIN * 2 - 24) / 2
  drawText(page, 'People', MARGIN, y - 12, 13, bold, INK)
  drawText(page, 'Completed requests only.', MARGIN + 60, y - 11, 9.5, helv, MUTED)
  const peopleY = y - PEOPLE_HEADING_H

  // Both cards take the TALLER column's height so their frames align; a card
  // sized to its own shorter list would leave the pair visibly ragged.
  const shownMembers = Math.min(report.people.members.length, PEOPLE_LIMIT)
  const shownVolunteers = Math.min(report.people.volunteers.length, PEOPLE_LIMIT)
  const cardH = Math.max(peopleColumnHeight(shownMembers), peopleColumnHeight(shownVolunteers))

  drawPeopleTable(page, fonts, 'Members', report.people.members, MARGIN, peopleY, colW, cardH)
  drawPeopleTable(page, fonts, 'Volunteers', report.people.volunteers, MARGIN + colW + 24, peopleY, colW, cardH)
}

function drawPeopleTable (page, fonts, heading, rows, x, y, width, cardH) {
  const { helv, bold } = fonts
  const shown = topN(rows, PEOPLE_LIMIT)

  roundedRect(page, { x, y, w: width, h: cardH })

  // Content is inset by CARD_PAD on both sides; the rule and right-aligned
  // counts stop at the padded edge, not the card edge.
  const ix = x + CARD_PAD
  const countX = x + width - CARD_PAD

  drawText(page, heading, ix, y - CARD_PAD - 11, 11, bold, INK)
  let cy = y - CARD_PAD - 29
  drawText(page, 'Name', ix, cy, 9, bold, MUTED)
  rightText(page, 'Completed', countX, cy, 9, bold, MUTED)
  cy -= 6
  page.drawLine({ start: { x: ix, y: cy }, end: { x: countX, y: cy }, thickness: 1, color: LINE })
  cy -= 14

  for (const r of shown) {
    drawText(page, r.fullName, ix, cy, 9.5, helv, INK)
    rightText(page, String(r.count), countX, cy, 9.5, helv, INK)
    cy -= 13
  }

  cy -= 6
  drawText(page, peopleFooter(shown.length, rows.length, heading.toLowerCase()), ix, cy, 8, helv, MUTED)
}

export async function buildMetricsPdf (report) {
  const pdf = await PDFDocument.create()
  const fonts = {
    helv: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
  const { helv, bold } = fonts

  const footer = (page) => {
    drawText(page, `Village Green — generated for ${formatRange(report.start, report.end)}`,
      MARGIN, MARGIN - 18, 8, helv, MUTED)
  }

  // ---- Page 1: header + summary strip + Categories + Outcomes ----
  const p1 = pdf.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  // Three tiers: WHAT (village) -> WHEN (range) -> caveats (muted fine print).
  // The range is the fact that distinguishes this document from every other
  // export, so it gets its own line in bold INK rather than sharing the
  // disclaimer's weight. It is NOT appended to the title line: that line
  // already uses an em dash, and village names are variable-width — pdf-lib
  // does not wrap, so a long name plus a range would run silently off the page.
  drawText(p1, `${report.villageName} — Metrics`, MARGIN, y - 18, 18, bold, INK)
  y -= 32
  drawText(p1, formatRange(report.start, report.end), MARGIN, y - 11, 11, bold, INK)
  y -= 20
  const legsNote = report.legs ? 'Round trips counted as 2 legs' : 'Round trips counted once'
  drawText(p1, `${legsNote}  ·  Hub-cancelled requests are excluded from all counts.`,
    MARGIN, y - 10, 9.5, helv, MUTED)
  y -= 22
  p1.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: LINE })
  y -= 26

  const stats = [
    ['Requests', report.strip.requests],
    ['Completed', report.strip.completed],
    ['Cancelled', report.strip.cancelled],
    ['Unmatched', report.strip.unmatched],
  ]
  // Framed to match the on-screen .stat-card boxes. Without frames the top of
  // page 1 sits bare above framed sections, which reads as unfinished rather
  // than airy.
  const statGap = 10
  const statW = (PAGE_W - MARGIN * 2 - statGap * (stats.length - 1)) / stats.length
  stats.forEach(([label, value], i) => {
    const x = MARGIN + i * (statW + statGap)
    roundedRect(p1, { x, y, w: statW, h: STAT_CARD_H, r: 6 })
    drawText(p1, label, x + 10, y - 16, 9, helv, MUTED)
    drawText(p1, String(value), x + 10, y - 40, 18, bold, INK)
  })
  y -= STAT_CARD_H + CARD_GAP

  y = await drawPieSection(pdf, p1, fonts, 'Categories',
    `Status: ${STATUS_TEXT[report.views.categories.status] ?? report.views.categories.status}`,
    report.images.categories, report.views.categories, y)

  await drawPieSection(pdf, p1, fonts, 'Outcomes', '',
    report.images.outcomes, report.views.outcomes, y)
  footer(p1)

  // ---- Page 2: Services, then People beneath it if it fits ----
  const p2 = pdf.addPage([PAGE_W, PAGE_H])
  const svc = report.views.services
  const svcSub = `Status: ${STATUS_TEXT[svc.status] ?? svc.status}`
    + (svc.category && svc.category !== 'all' ? `  ·  Category: ${svc.category}` : '')
  const afterServicesY = await drawPieSection(pdf, p2, fonts, 'Services', svcSub,
    report.images.services, svc, PAGE_H - MARGIN)

  const requiredPeopleH = peopleSectionHeight(report)
  const availablePeopleH = afterServicesY - FOOTER_Y

  if (requiredPeopleH <= availablePeopleH) {
    drawPeopleSection(p2, fonts, report, afterServicesY)
    footer(p2)
  } else {
    footer(p2)
    // ---- Page 3: People spilled over — not enough room beneath Services ----
    const p3 = pdf.addPage([PAGE_W, PAGE_H])
    drawPeopleSection(p3, fonts, report, PAGE_H - MARGIN)
    footer(p3)
  }

  return pdf.save()
}
