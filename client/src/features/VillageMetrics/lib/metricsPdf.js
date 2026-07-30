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

export const PEOPLE_LIMIT = 25

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

  y = await drawPieSection(pdf, p1, fonts, 'Categories',
    `Status: ${STATUS_TEXT[report.views.categories.status] ?? report.views.categories.status}`,
    report.images.categories, report.views.categories, y)

  await drawPieSection(pdf, p1, fonts, 'Outcomes', '',
    report.images.outcomes, report.views.outcomes, y)
  footer(p1)

  // ---- Page 2: Services (alone — its legend is the longest) ----
  const p2 = pdf.addPage([PAGE_W, PAGE_H])
  const svc = report.views.services
  const svcSub = `Status: ${STATUS_TEXT[svc.status] ?? svc.status}`
    + (svc.category && svc.category !== 'all' ? `  ·  Category: ${svc.category}` : '')
  await drawPieSection(pdf, p2, fonts, 'Services', svcSub,
    report.images.services, svc, PAGE_H - MARGIN)
  footer(p2)

  // ---- Page 3: People, top 25 each, side by side ----
  const p3 = pdf.addPage([PAGE_W, PAGE_H])
  const colW = (PAGE_W - MARGIN * 2 - 24) / 2
  drawText(p3, 'People', MARGIN, PAGE_H - MARGIN - 12, 13, bold, INK)
  drawText(p3, 'Completed requests only.', MARGIN + 60, PAGE_H - MARGIN - 11, 9.5, helv, MUTED)
  const peopleY = PAGE_H - MARGIN - 40
  drawPeopleTable(p3, fonts, 'Members', report.people.members, MARGIN, peopleY, colW)
  drawPeopleTable(p3, fonts, 'Volunteers', report.people.volunteers, MARGIN + colW + 24, peopleY, colW)
  footer(p3)

  return pdf.save()
}
