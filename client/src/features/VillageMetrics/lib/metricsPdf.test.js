import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { PEOPLE_LIMIT, topN, peopleFooter, buildMetricsPdf, winAnsi, formatCivil, formatRange } from './metricsPdf.js'

const ROWS = [
  { label: 'Rides', value: 704, color: '#22c55e', pct: 0.8009 },
  { label: 'Errands', value: 53, color: '#f59e0b', pct: 0.0603 },
]

function people (n, prefix) {
  return Array.from({ length: n }, (_, i) => ({
    personId: String(i), fullName: `${prefix}, P${i}`, count: n - i,
  }))
}

// A distinct-serviceName legend row per entry — Services' legend is unrolled
// per serviceName with no Other-merge, so it can run much longer than the
// fixed-vocabulary Categories/Outcomes pies. Used to push the Services
// section tall enough on page 2 that People no longer fits beneath it.
function serviceRows (n) {
  return Array.from({ length: n }, (_, i) => ({
    label: `Service ${i}`, value: n - i, color: '#0ea5e9', pct: 1 / n,
  }))
}

function report (over = {}) {
  return {
    villageName: 'Sample Village',
    start: '2026-01-01',
    end: '2026-07-30',
    legs: true,
    strip: { requests: 1001, completed: 879, unmatched: 37, cancelled: 85 },
    images: { categories: null, services: null, outcomes: null },
    views: {
      categories: { rows: ROWS, status: 'completed', emptyMessage: 'No completed requests in this range' },
      services: { rows: ROWS, status: 'completed', category: 'all', emptyMessage: 'No completed requests in this range' },
      outcomes: { rows: ROWS, emptyMessage: 'No requests in this range' },
    },
    people: { members: people(3, 'M'), volunteers: people(3, 'V') },
    ...over,
  }
}

describe('civil date formatting', () => {
  it('renders a civil date without a timezone shift', () => {
    // Jan 1 must stay Jan 1. `new Date('2026-01-01')` is UTC midnight, which is
    // Dec 31 in every western zone — the exact bug this helper must not have.
    expect(formatCivil('2026-01-01')).toBe('January 1, 2026')
    expect(formatCivil('2026-07-30')).toBe('July 30, 2026')
    expect(formatCivil('2026-12-31')).toBe('December 31, 2026')
  })

  it('drops leading zeros from the day', () => {
    expect(formatCivil('2026-03-05')).toBe('March 5, 2026')
  })

  it('collapses a shared year into one mention', () => {
    expect(formatRange('2026-01-01', '2026-07-30')).toBe('January 1 – July 30, 2026')
  })

  it('keeps both years when the range spans a year boundary', () => {
    expect(formatRange('2025-11-01', '2026-02-28'))
      .toBe('November 1, 2025 – February 28, 2026')
  })

  it('passes malformed input through rather than inventing a date', () => {
    expect(formatCivil('not-a-date')).toBe('not-a-date')
    expect(formatCivil('')).toBe('')
    expect(formatCivil(null)).toBe('')
    expect(formatRange('nope', '2026-07-30')).toBe('nope – July 30, 2026')
  })

  it('rejects an out-of-range month rather than emitting undefined', () => {
    expect(formatCivil('2026-13-01')).toBe('2026-13-01')
  })

  // The en dash must survive the PDF's WinAnsi sanitizer.
  it('uses an en dash that Helvetica can encode', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const range = formatRange('2026-01-01', '2026-07-30')
    expect(range).toContain('–')
    expect(winAnsi(range, font)).toBe(range)
  })
})

describe('metricsPdf', () => {
  it('caps People tables at 20', () => {
    expect(PEOPLE_LIMIT).toBe(20)
    expect(topN(people(200, 'M'), PEOPLE_LIMIT)).toHaveLength(20)
  })

  it('takes the highest counts first', () => {
    const sorted = topN([{ count: 1 }, { count: 9 }, { count: 5 }], 2)
    expect(sorted.map(r => r.count)).toEqual([9, 5])
  })

  it('returns everything when under the limit', () => {
    expect(topN(people(3, 'M'), 25)).toHaveLength(3)
  })

  // Truncation must be REPORTED, never silent — same rule generateLabelPdf follows.
  it('reports truncation in the footer', () => {
    expect(peopleFooter(25, 233, 'members'))
      .toBe('Showing top 25 of 233 members by completed requests.')
  })

  it('says nothing about truncation when nothing was truncated', () => {
    expect(peopleFooter(3, 3, 'members')).toBe('Showing all 3 members by completed requests.')
  })

  // People fits beneath Services on page 2 whenever there's room for it — a
  // small monthly-shaped report (few services, few people) is the common case.
  it('draws People beneath Services on page 2 when it fits, producing a 2-page document', async () => {
    const bytes = await buildMetricsPdf(report({
      people: { members: people(7, 'M'), volunteers: people(7, 'V') },
    }))
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(2)
  })

  it('produces a non-trivial file', async () => {
    expect((await buildMetricsPdf(report())).length).toBeGreaterThan(1000)
  })

  it('survives empty pies and empty people', async () => {
    const bytes = await buildMetricsPdf(report({
      views: {
        categories: { rows: [], status: 'open', emptyMessage: 'No open requests in this range' },
        services: { rows: [], status: 'open', category: 'all', emptyMessage: 'No open requests in this range' },
        outcomes: { rows: [], emptyMessage: 'No requests in this range' },
      },
      people: { members: [], volunteers: [] },
    }))
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2)
  })

  // Helvetica is WinAnsi-only; one stray character otherwise kills the document.
  it('does not throw on non-WinAnsi names', async () => {
    const bytes = await buildMetricsPdf(report({
      people: {
        members: [{ personId: '1', fullName: 'Ünicode, Zoë — 日本', count: 4 }],
        volunteers: [],
      },
    }))
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2)
  })

  describe('People placement on page 2', () => {
    // Monthly-shaped report: small People counts fit beneath Services with
    // room to spare, so no third page is needed.
    it('produces a 2-page document for a monthly-shaped report (7 members, 7 volunteers, 6 services)', async () => {
      const bytes = await buildMetricsPdf(report({
        views: {
          categories: { rows: ROWS, status: 'completed', emptyMessage: 'No completed requests in this range' },
          services: { rows: serviceRows(6), status: 'completed', category: 'all', emptyMessage: 'No completed requests in this range' },
          outcomes: { rows: ROWS, emptyMessage: 'No requests in this range' },
        },
        people: { members: people(7, 'M'), volunteers: people(7, 'V') },
      }))
      const doc = await PDFDocument.load(bytes)
      expect(doc.getPageCount()).toBe(2)
    })

    // People counts at/above the cap still fit under Services in the common
    // case (few service types) — correct document, correct truncation wording
    // (verified against real rendered PDF text via pdftotext separately).
    it('still fits on page 2 and reports truncation when People counts are at the cap', async () => {
      const bytes = await buildMetricsPdf(report({
        people: { members: people(233, 'M'), volunteers: people(206, 'V') },
      }))
      const doc = await PDFDocument.load(bytes)
      expect(doc.getPageCount()).toBe(2)
      expect(peopleFooter(PEOPLE_LIMIT, 233, 'members'))
        .toBe('Showing top 20 of 233 members by completed requests.')
      expect(peopleFooter(PEOPLE_LIMIT, 206, 'volunteers'))
        .toBe('Showing top 20 of 206 volunteers by completed requests.')
    })

    // When the Services legend is long enough (many distinct serviceNames —
    // it has no Other-merge, unlike Categories/Outcomes), there isn't 382pt
    // of room left for a full 20/20 People block on page 2, and it must
    // spill to a genuine third page rather than overlap the footer.
    it('spills People to a third page when Services leaves too little room', async () => {
      const bytes = await buildMetricsPdf(report({
        views: {
          categories: { rows: ROWS, status: 'completed', emptyMessage: 'No completed requests in this range' },
          services: { rows: serviceRows(25), status: 'completed', category: 'all', emptyMessage: 'No completed requests in this range' },
          outcomes: { rows: ROWS, emptyMessage: 'No requests in this range' },
        },
        people: { members: people(20, 'M'), volunteers: people(20, 'V') },
      }))
      const doc = await PDFDocument.load(bytes)
      expect(doc.getPageCount()).toBe(3)
    })
  })

  describe('winAnsi', () => {
    it('passes an em dash and a middle dot through unchanged', async () => {
      const pdf = await PDFDocument.create()
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      expect(winAnsi('A — B · C', font)).toBe('A — B · C')
      // Also confirm it actually builds into a PDF without throwing.
      const bytes = await buildMetricsPdf(report({ villageName: 'Westerly — Sample · Village' }))
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2)
    })

    it('keeps precomposed accented Latin characters intact (WinAnsi covers them)', async () => {
      const pdf = await PDFDocument.create()
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      expect(winAnsi('Zoë', font)).toBe('Zoë')
      expect(winAnsi('Ünicode', font)).toBe('Ünicode')
    })

    it('degrades genuinely unencodable characters (CJK) to ? instead of throwing', async () => {
      const pdf = await PDFDocument.create()
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      expect(winAnsi('日本', font)).toBe('??')
      expect(winAnsi('Ünicode, Zoë — 日本', font)).toBe('Ünicode, Zoë — ??')
    })
  })
})
