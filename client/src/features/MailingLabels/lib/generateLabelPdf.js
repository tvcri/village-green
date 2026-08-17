import { PDFDocument, StandardFonts } from 'pdf-lib'
import { PAGE, LABELS_PER_SHEET, cellOrigin, usableTextWidth } from './avery5160'

const FONT_SIZE = 10
const LINE_HEIGHT = 11

// Four lines fit comfortably in a 1in label at 10pt. Unit is omitted when
// absent, collapsing to three.
//
// Unit goes ABOVE street, at customer request (2026-07-27). USPS Pub 28
// prefers the secondary designator appended to the delivery address line
// ("123 Main St Apt 4B") and treats the line-above form as the alternate,
// intended for when the combined line will not fit. This is a deliberate
// deviation, not an oversight — do not "correct" it to the Pub 28 default
// without asking the customer.
function labelLines (label) {
  const cityLine = [
    [label.city, label.state].filter(Boolean).join(', '),
    label.zip,
  ].filter(Boolean).join(' ')

  return [label.name, label.unit, label.street, cityLine].filter(Boolean)
}

// Standard Helvetica encodes WinAnsi only; one character outside it makes
// drawText throw and kills the whole PDF. The dev data is pure ASCII, so this
// is insurance: strip diacritics, replace anything else with '?'.
function toWinAnsiSafe (text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
}

// Truncation is REPORTED, never silent: a silently truncated mailing label
// means a wrong address goes out.
function fitLine (text, font) {
  const max = usableTextWidth()
  if (font.widthOfTextAtSize(text, FONT_SIZE) <= max) return { text, cut: false }

  let out = text
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, FONT_SIZE) > max) {
    out = out.slice(0, -1)
  }
  return { text: `${out}…`, cut: true }
}

export async function generateLabelPdf (labels, options = {}) {
  const { startPosition = 1, nudgeX = 0, nudgeY = 0, title = null } = options
  const pdf = await PDFDocument.create()
  // Metadata is UTF-16 in pdf-lib — full Unicode is fine here; only drawText
  // with WinAnsi Helvetica needs sanitizing.
  if (title) pdf.setTitle(title)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const truncated = []

  const skip = Math.max(0, Math.min(LABELS_PER_SHEET - 1, startPosition - 1))
  let page = null

  labels.forEach((label, i) => {
    const slot = i + skip
    if (slot % LABELS_PER_SHEET === 0 || page === null) {
      page = pdf.addPage([PAGE.width, PAGE.height])
    }

    const { x, y } = cellOrigin(slot % LABELS_PER_SHEET, { nudgeX, nudgeY })
    labelLines(label).forEach((line, lineIndex) => {
      const safe = toWinAnsiSafe(line)
      const { text, cut } = fitLine(safe, font)
      if (cut) truncated.push({ name: label.name, line, printed: text })
      page.drawText(text, {
        x, y: y - lineIndex * LINE_HEIGHT, size: FONT_SIZE, font,
      })
    })
  })

  const bytes = await pdf.save()
  return { blob: new Blob([bytes], { type: 'application/pdf' }), truncated }
}
