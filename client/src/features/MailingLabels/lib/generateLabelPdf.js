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

// A 1in label at 11pt leading holds four lines comfortably; five would eat
// the bottom margin that absorbs printer feed drift and nudge adjustments.
const MAX_LINES = 4

// Word-boundary wrap of a too-wide name into two fitting lines, or null when
// two lines aren't enough (single overlong word, or a tail that still
// overflows — shrinking the head only grows the tail). Prefers breaking
// before "and": merged couple names split most readably there.
function wrapNameLine (text, font) {
  const max = usableTextWidth()
  const width = t => font.widthOfTextAtSize(t, FONT_SIZE)
  const words = text.split(' ')
  if (words.length < 2) return null

  const andIndex = words.indexOf('and')
  if (andIndex > 0) {
    const head = words.slice(0, andIndex).join(' ')
    const tail = words.slice(andIndex).join(' ')
    if (width(head) <= max && width(tail) <= max) return [head, tail]
  }

  for (let k = words.length - 1; k >= 1; k--) {
    const head = words.slice(0, k).join(' ')
    if (width(head) > max) continue
    const tail = words.slice(k).join(' ')
    return width(tail) <= max ? [head, tail] : null
  }
  return null
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

    // A too-wide name wraps onto a second line when a word boundary allows
    // it and the label stays within MAX_LINES (i.e. there is no unit line to
    // displace). Anything still too wide falls back to ellipsis + report.
    const source = labelLines(label)
    const drawLines = []
    source.forEach((line, sourceIndex) => {
      const safe = toWinAnsiSafe(line)
      const isName = sourceIndex === 0
      if (isName && source.length < MAX_LINES
          && font.widthOfTextAtSize(safe, FONT_SIZE) > usableTextWidth()) {
        const pair = wrapNameLine(safe, font)
        if (pair) {
          drawLines.push(...pair.map(text => ({ text, original: line })))
          return
        }
      }
      drawLines.push({ text: safe, original: line })
    })

    drawLines.forEach((drawLine, lineIndex) => {
      const { text, cut } = fitLine(drawLine.text, font)
      if (cut) truncated.push({ name: label.name, line: drawLine.original, printed: text })
      page.drawText(text, {
        x, y: y - lineIndex * LINE_HEIGHT, size: FONT_SIZE, font,
      })
    })
  })

  const bytes = await pdf.save()
  return { blob: new Blob([bytes], { type: 'application/pdf' }), truncated }
}
