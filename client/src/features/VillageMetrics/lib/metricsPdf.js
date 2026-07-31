// Assembles the Village Metrics PDF. Takes already-captured pie images plus row
// data and returns bytes — no DOM, no Vue, no canvas, so it is unit-testable.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 54

const INK = rgb(0.09, 0.09, 0.11)
const MUTED = rgb(0.42, 0.45, 0.5)
const LINE = rgb(0.9, 0.91, 0.92)

const PIE_SIZE = 200
const ROW_H = 15

// Baseline the footer text is drawn at (see `footer` in buildMetricsPdf).
// Nothing else may draw at or below this y.
const FOOTER_Y = MARGIN - 18
// "People" heading + its subtitle, drawn once above both columns.
const PEOPLE_HEADING_H = 40

export const PEOPLE_LIMIT = 20

const STATUS_TEXT = {
  all: 'All statuses',
  open: 'Open',
  confirmed: 'Confirmed',
  completed: 'Completed',
  unmatched: 'Unmatched',
  memberCancelled: 'Member cancelled',
  volunteerCancelled: 'Volunteer cancelled',
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

// Legend table drawn as TEXT, not baked into the image, so it stays selectable
// and searchable in the finished PDF.
function drawLegend (page, fonts, rows, x, y, width) {
  const { helv, bold } = fonts
  const valueX = x + width - 70
  const pctX = x + width
  let cy = y

  drawText(page, 'Label', x + 18, cy, 9, bold, MUTED)
  rightText(page, 'Value', valueX, cy, 9, bold, MUTED)
  rightText(page, 'Pct', pctX, cy, 9, bold, MUTED)
  cy -= 6
  page.drawLine({ start: { x, y: cy }, end: { x: x + width, y: cy }, thickness: 1, color: LINE })
  cy -= 14

  let total = 0
  for (const r of rows) {
    total += r.value
    page.drawRectangle({ x, y: cy - 1, width: 9, height: 9, color: hexColor(r.color) })
    drawText(page, r.label, x + 18, cy, 10, helv, INK)
    rightText(page, String(r.value), valueX, cy, 10, helv, INK)
    rightText(page, `${Math.round((r.pct ?? 0) * 100)}%`, pctX, cy, 10, helv, INK)
    cy -= ROW_H
    page.drawLine({ start: { x, y: cy + 9 }, end: { x: x + width, y: cy + 9 }, thickness: 0.5, color: LINE })
  }

  if (rows.length > 0) {
    cy -= 2
    drawText(page, 'Total', x + 18, cy, 10, bold, INK)
    rightText(page, String(total), valueX, cy, 10, bold, INK)
    cy -= ROW_H
  }
  return cy
}

// One pie + its legend side by side, matching the on-screen card layout.
async function drawPieSection (pdf, page, fonts, title, subtitle, image, view, y) {
  const { helv, bold } = fonts
  drawText(page, title, MARGIN, y - 12, 13, bold, INK)
  if (subtitle) drawText(page, subtitle, MARGIN + 110, y - 11, 9.5, helv, MUTED)
  y -= 28

  if (image) {
    const png = await pdf.embedPng(image)
    page.drawImage(png, { x: MARGIN, y: y - PIE_SIZE, width: PIE_SIZE, height: PIE_SIZE })
  } else {
    drawText(page, view.emptyMessage, MARGIN, y - PIE_SIZE / 2, 10, helv, MUTED)
  }

  const legendX = MARGIN + PIE_SIZE + 24
  const legendW = PAGE_W - MARGIN - legendX
  const legendBottom = drawLegend(page, fonts, view.rows, legendX, y - 6, legendW)

  return Math.min(y - PIE_SIZE, legendBottom) - 24
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
  return 18 + 38 + rowCount * 13 + 26
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
  drawPeopleTable(page, fonts, 'Members', report.people.members, MARGIN, peopleY, colW)
  drawPeopleTable(page, fonts, 'Volunteers', report.people.volunteers, MARGIN + colW + 24, peopleY, colW)
}

function drawPeopleTable (page, fonts, heading, rows, x, y, width) {
  const { helv, bold } = fonts
  const shown = topN(rows, PEOPLE_LIMIT)
  const countX = x + width

  drawText(page, heading, x, y, 11, bold, INK)
  let cy = y - 18
  drawText(page, 'Name', x, cy, 9, bold, MUTED)
  rightText(page, 'Completed', countX, cy, 9, bold, MUTED)
  cy -= 6
  page.drawLine({ start: { x, y: cy }, end: { x: countX, y: cy }, thickness: 1, color: LINE })
  cy -= 14

  for (const r of shown) {
    drawText(page, r.fullName, x, cy, 9.5, helv, INK)
    rightText(page, String(r.count), countX, cy, 9.5, helv, INK)
    cy -= 13
  }

  cy -= 6
  drawText(page, peopleFooter(shown.length, rows.length, heading.toLowerCase()), x, cy, 8, helv, MUTED)
}

export async function buildMetricsPdf (report) {
  const pdf = await PDFDocument.create()
  const fonts = {
    helv: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
  const { helv, bold } = fonts

  const footer = (page) => {
    drawText(page, `Village Green — generated for ${report.start} to ${report.end}`,
      MARGIN, MARGIN - 18, 8, helv, MUTED)
  }

  // ---- Page 1: header + summary strip + Categories + Outcomes ----
  const p1 = pdf.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  drawText(p1, `${report.villageName} — Metrics`, MARGIN, y - 18, 18, bold, INK)
  y -= 30
  const legsNote = report.legs ? 'Round trips counted as 2 legs' : 'Round trips counted once'
  drawText(p1, `${report.start} to ${report.end}  ·  ${legsNote}`, MARGIN, y - 10, 9.5, helv, MUTED)
  y -= 16
  drawText(p1, 'Hub-cancelled requests are excluded from all counts.', MARGIN, y - 10, 9.5, helv, MUTED)
  y -= 22
  p1.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: LINE })
  y -= 26

  const stats = [
    ['Requests', report.strip.requests],
    ['Completed', report.strip.completed],
    ['Cancelled', report.strip.cancelled],
    ['Unmatched', report.strip.unmatched],
  ]
  const cellW = (PAGE_W - MARGIN * 2) / stats.length
  stats.forEach(([label, value], i) => {
    const x = MARGIN + i * cellW
    drawText(p1, label, x, y - 10, 9, helv, MUTED)
    drawText(p1, String(value), x, y - 30, 18, bold, INK)
  })
  y -= 50

  // Extra breathing room so Categories doesn't sit tight against the strip —
  // matches the whitespace Outcomes gets above it (drawPieSection's own 24pt
  // trailing gap). Verified page 1 still clears the footer at max legend rows
  // (5 categories + 4 outcomes): ~40pt of clearance remains above y=36.
  y -= 14

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
