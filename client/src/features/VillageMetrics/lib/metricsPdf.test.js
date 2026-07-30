import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { PEOPLE_LIMIT, topN, peopleFooter, buildMetricsPdf } from './metricsPdf.js'

const ROWS = [
  { label: 'Rides', value: 704, color: '#22c55e', pct: 0.8009 },
  { label: 'Errands', value: 53, color: '#f59e0b', pct: 0.0603 },
]

function people (n, prefix) {
  return Array.from({ length: n }, (_, i) => ({
    personId: String(i), fullName: `${prefix}, P${i}`, count: n - i,
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

describe('metricsPdf', () => {
  it('caps People tables at 25', () => {
    expect(PEOPLE_LIMIT).toBe(25)
    expect(topN(people(200, 'M'), PEOPLE_LIMIT)).toHaveLength(25)
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

  it('builds a three-page document', async () => {
    const bytes = await buildMetricsPdf(report())
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(3)
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
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3)
  })

  // Helvetica is WinAnsi-only; one stray character otherwise kills the document.
  it('does not throw on non-WinAnsi names', async () => {
    const bytes = await buildMetricsPdf(report({
      people: {
        members: [{ personId: '1', fullName: 'Ünicode, Zoë — 日本', count: 4 }],
        volunteers: [],
      },
    }))
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3)
  })
})
