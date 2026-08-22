// Assembles the Meta Metrics PDF: the summary strip, then one page per tab,
// each a table of villages with its bars drawn in the rows.
//
// Simpler than the village document by a wide margin, and deliberately so. That
// one captures Chart.js canvases offscreen at 3x and draws them as rasters,
// which forces the capture and the draw box to share proportions or pdf-lib
// stretches the image. This page has no canvas: the bars are percentages, so
// they are plain rectangles from the same barSegments() the screen uses. Screen
// and print cannot drift, because they read the same numbers.

import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  PAGE_W as PORTRAIT_W, PAGE_H as PORTRAIT_H, MARGIN, INK, MUTED, LINE, BORDER, TINT,
  formatRange, hexColor, drawText, rightText, roundedRect,
} from '../../../shared/lib/pdf/pdfPrimitives.js'

// LANDSCAPE, unlike the village report. These tables are wide by nature — a
// village name, up to five numeric columns and a bar — and in portrait the bar
// was squeezed to 58pt on the Detail page, a fifth of what the screen gives it.
// Turning the page recovers 180pt and puts the proportions back near the
// browser's, which is what a reader is comparing the print against.
const PAGE_W = PORTRAIT_H
const PAGE_H = PORTRAIT_W
import { barSegments, isStackedLayout } from './barGeometry.js'
import { matrixColumns, matrixCells, matrixFooter } from './matrixTable.js'

const CONTENT_W = PAGE_W - MARGIN * 2

const ROW_H = 18
const HEADER_H = 20
const NAME_W = 104
const NUM_W = 46
// What is left for the bar once the name and numeric columns are placed. The
// bar column is elastic on screen for the same reason: it should absorb the
// leftover rather than fix a width the columns must fit around.
const BAR_GAP = 14

const STRIP_H = 46
const SECTION_TITLE_H = 26

// Rows that fit under a section title with the strip above it, on a LANDSCAPE
// page (612pt tall). Deliberately a constant rather than a measurement:
// pagination has to be decidable before any drawing happens, so the caller can
// be tested without a PDFDocument. 13 villages fit comfortably today; this is
// the ceiling before a section spills to a second page.
export const MAX_ROWS_PER_PAGE = 18

/**
 * Splits sections into pages. Each section starts a new page — they are
 * different tables with different columns, and running one into the tail of
 * another invites reading a row against the wrong header.
 *
 * A section with no rows is dropped rather than printed empty: a heading over
 * nothing tells the reader less than its absence does.
 */
export function metaPdfSections (sections) {
  const pages = []
  for (const section of sections) {
    if (!section.rows?.length) continue
    for (let i = 0; i < section.rows.length; i += MAX_ROWS_PER_PAGE) {
      pages.push({
        ...section,
        rows: section.rows.slice(i, i + MAX_ROWS_PER_PAGE),
        continued: i > 0,
      })
    }
  }
  return pages
}

function drawStrip (page, fonts, strip) {
  const cards = [
    { label: 'Villages', value: strip.villages, pct: null },
    { label: 'Requests', value: strip.requests, pct: null },
    { label: 'Completed', value: strip.completed, pct: strip.completedPct },
    { label: 'Cancelled', value: strip.cancelled, pct: strip.cancelledPct },
    { label: 'Unmatched', value: strip.unmatched, pct: strip.unmatchedPct },
  ]
  const gap = 8
  const w = (CONTENT_W - gap * (cards.length - 1)) / cards.length
  let x = MARGIN
  const top = PAGE_H - MARGIN - 52

  for (const card of cards) {
    roundedRect(page, { x, y: top, w, h: STRIP_H, r: 5, fill: TINT })
    drawText(page, card.label, x + 8, top - 16, 7.5, fonts.helv, MUTED)
    drawText(page, card.value.toLocaleString(), x + 8, top - 34, 14, fonts.bold, INK)
    if (typeof card.pct === 'number') {
      const numberW = fonts.bold.widthOfTextAtSize(card.value.toLocaleString(), 14)
      drawText(page, `${card.pct.toFixed(1)}%`, x + 12 + numberW, top - 34, 7.5, fonts.helv, MUTED)
    }
    x += w + gap
  }
  return top - STRIP_H
}

// One table. Returns nothing — the caller owns the page and its geometry.
function drawSection (page, fonts, section, view) {
  const columns = matrixColumns(section.series, view)
  const cells = matrixCells(section.rows, section.series, view)
  const foot = matrixFooter(section.rows, section.series, view)
  const { segments, trackPct } = barSegments(
    section.rows, section.series, view, { layout: section.layout },
  )

  let y = PAGE_H - MARGIN - 52 - STRIP_H - SECTION_TITLE_H

  const title = section.continued ? `${section.title} (continued)` : section.title
  drawText(page, title, MARGIN, y, 12, fonts.bold, INK)
  if (section.note) {
    const titleW = fonts.bold.widthOfTextAtSize(title, 12)
    drawText(page, section.note, MARGIN + titleW + 10, y + 1, 7.5, fonts.helv, MUTED)
  }
  y -= HEADER_H

  // Numeric columns sit between the name and the bar. The header uses the same
  // short labels as the screen, for the same reason: they must not wrap.
  const numCols = columns.slice(1)
  const numbersW = NUM_W * numCols.length
  const barX = MARGIN + NAME_W + numbersW + BAR_GAP
  const barW = PAGE_W - MARGIN - barX

  drawText(page, columns[0].header, MARGIN, y, 7.5, fonts.bold, MUTED)
  numCols.forEach((col, i) => {
    rightText(page, col.header, MARGIN + NAME_W + NUM_W * (i + 1) - 6, y, 7.5, fonts.bold, MUTED)
  })

  y -= 6
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75, color: BORDER,
  })

  cells.forEach((row, r) => {
    y -= ROW_H
    drawText(page, row.villageName, MARGIN, y + 5, 8, fonts.helv, INK)
    numCols.forEach((col, i) => {
      const value = typeof row[col.key] === 'number' ? row[col.key].toLocaleString() : row[col.key]
      rightText(page, String(value), MARGIN + NAME_W + NUM_W * (i + 1) - 6, y + 5, 8, fonts.helv, MUTED)
    })

    // The bar, in the same row as its numbers — the whole point of the screen
    // layout, and the reason this document needs no chart images.
    const track = (trackPct[r] / 100) * barW
    if (isStackedLayout(section.layout, view)) {
      let bx = barX
      for (const seg of segments[r]) {
        const w = (seg.width / 100) * track
        if (w > 0) {
          page.drawRectangle({ x: bx, y: y + 2, width: w, height: 9, color: hexColor(seg.colorLight) })
          bx += w
        }
      }
    } else {
      // Grouped: one thin bar per series, abutting, sharing one scale — the
      // same treatment as the screen. Height is divided from the row rather
      // than fixed, so three outcomes and four categories both fill it.
      const h = 12 / segments[r].length
      segments[r].forEach((seg, s) => {
        const w = (seg.width / 100) * barW
        if (w > 0) {
          page.drawRectangle({
            x: barX, y: y + 13 - (s + 1) * h, width: w, height: h - 0.4,
            color: hexColor(seg.colorLight),
          })
        }
      })
    }

    page.drawLine({
      start: { x: MARGIN, y: y - 4 }, end: { x: PAGE_W - MARGIN, y: y - 4 },
      thickness: 0.5, color: LINE,
    })
  })

  // Totals only on the last page of a section — repeating them under a partial
  // table would state a total the rows above do not add up to.
  if (!section.hasMore) {
    y -= ROW_H
    drawText(page, foot.villageName, MARGIN, y + 5, 8, fonts.bold, INK)
    numCols.forEach((col, i) => {
      // Same formatting as the body rows: an unseparated 3550 under a column of
      // 3,550s reads as a different kind of number.
      const raw = foot[col.key]
      const value = typeof raw === 'number' ? raw.toLocaleString() : raw
      rightText(page, String(value), MARGIN + NAME_W + NUM_W * (i + 1) - 6, y + 5, 8, fonts.bold, INK)
    })
  }
}

function drawHeader (page, fonts, report) {
  drawText(page, 'Hub — Metrics', MARGIN, PAGE_H - MARGIN - 6, 16, fonts.bold, INK)
  drawText(page, formatRange(report.start, report.end), MARGIN, PAGE_H - MARGIN - 24, 9, fonts.helv, MUTED)
  drawText(
    page,
    'Hub-cancelled requests are excluded. Completed round-trip rides count as two services.',
    MARGIN, PAGE_H - MARGIN - 38, 7.5, fonts.helv, MUTED,
  )
}

function drawFooter (page, fonts, index, total) {
  rightText(page, `Page ${index} of ${total}`, PAGE_W - MARGIN, MARGIN - 18, 7.5, fonts.helv, MUTED)
}

/**
 * @param {object} report
 *   {start, end, strip, view, sections:[{key,title,note,rows,series,layout}]}
 * @returns {Promise<Uint8Array>}
 */
export async function buildMetaMetricsPdf (report) {
  const pdf = await PDFDocument.create()
  const fonts = {
    helv: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }

  const pages = metaPdfSections(report.sections ?? [])
  // Flags the last page of each section, so only it draws the totals row.
  pages.forEach((p, i) => { p.hasMore = pages[i + 1]?.key === p.key })

  // A range with no data anywhere still produces a document: the header and the
  // strip are the answer to "what did we do this period", and zero is an answer.
  const total = Math.max(1, pages.length)

  if (!pages.length) {
    const page = pdf.addPage([PAGE_W, PAGE_H])
    drawHeader(page, fonts, report)
    drawStrip(page, fonts, report.strip)
    drawText(page, 'No requests in this range.', MARGIN, PAGE_H - MARGIN - 130, 9, fonts.helv, MUTED)
    drawFooter(page, fonts, 1, 1)
  }

  pages.forEach((section, i) => {
    const page = pdf.addPage([PAGE_W, PAGE_H])
    drawHeader(page, fonts, report)
    drawStrip(page, fonts, report.strip)
    drawSection(page, fonts, section, report.view)
    drawFooter(page, fonts, i + 1, total)
  })

  return pdf.save()
}
