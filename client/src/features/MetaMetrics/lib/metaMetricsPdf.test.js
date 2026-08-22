import { describe, it, expect } from 'vitest'
import { buildMetaMetricsPdf, metaPdfSections, MAX_ROWS_PER_PAGE } from './metaMetricsPdf.js'
import { STATUS_SERIES } from './reduceCells.js'
import { CATEGORY_SERIES } from './byVillageCategory.js'

const OUTCOME_ROWS = [
  { villageId: '1', villageName: 'Barrington', completed: 866, cancelled: 134, unmatched: 2, total: 1002 },
  { villageId: '2', villageName: 'Warwick', completed: 731, cancelled: 78, unmatched: 46, total: 855 },
]

const CATEGORY_ROWS = [
  { villageId: '1', villageName: 'Barrington', Rides: 431, Errands: 97, 'Home Help': 66, 'Tech Support': 12, total: 606 },
  { villageId: '2', villageName: 'Warwick', Rides: 212, Errands: 13, 'Home Help': 18, 'Tech Support': 15, total: 258 },
]

const report = (over = {}) => ({
  start: '2026-01-01',
  end: '2026-08-21',
  strip: {
    villages: 13, requests: 6026, completed: 5161, cancelled: 614, unmatched: 251,
    completedPct: 85.6, cancelledPct: 10.2, unmatchedPct: 4.2,
  },
  view: 'counts',
  sections: [
    { key: 'outcomes', title: 'Outcomes', note: 'Bars share one scale.', rows: OUTCOME_ROWS, series: STATUS_SERIES, layout: 'grouped' },
    { key: 'categories', title: 'Categories', note: 'Completed work only.', rows: CATEGORY_ROWS, series: CATEGORY_SERIES, layout: 'stacked' },
  ],
  ...over,
})

describe('metaPdfSections', () => {
  it('paginates a section that will not fit on one page', () => {
    const many = Array.from({ length: MAX_ROWS_PER_PAGE + 5 }, (_, i) => ({
      villageId: String(i), villageName: `V${i}`, completed: 10, cancelled: 1, unmatched: 0, total: 11,
    }))
    const pages = metaPdfSections([
      { key: 'outcomes', title: 'Outcomes', rows: many, series: STATUS_SERIES, layout: 'grouped' },
    ])
    expect(pages.length).toBe(2)
    expect(pages[0].rows).toHaveLength(MAX_ROWS_PER_PAGE)
    expect(pages[1].rows).toHaveLength(5)
  })

  it('marks a continued page so a reader knows the table did not restart', () => {
    const many = Array.from({ length: MAX_ROWS_PER_PAGE + 1 }, (_, i) => ({
      villageId: String(i), villageName: `V${i}`, completed: 1, cancelled: 0, unmatched: 0, total: 1,
    }))
    const pages = metaPdfSections([
      { key: 'outcomes', title: 'Outcomes', rows: many, series: STATUS_SERIES, layout: 'grouped' },
    ])
    expect(pages[0].continued).toBe(false)
    expect(pages[1].continued).toBe(true)
  })

  it('starts each section on its own page, never sharing one', () => {
    const pages = metaPdfSections(report().sections)
    expect(pages).toHaveLength(2)
    expect(pages[0].key).toBe('outcomes')
    expect(pages[1].key).toBe('categories')
  })

  it('drops a section with no rows rather than printing an empty table', () => {
    const pages = metaPdfSections([
      { key: 'outcomes', title: 'Outcomes', rows: [], series: STATUS_SERIES, layout: 'grouped' },
      { key: 'categories', title: 'Categories', rows: CATEGORY_ROWS, series: CATEGORY_SERIES, layout: 'stacked' },
    ])
    expect(pages).toHaveLength(1)
    expect(pages[0].key).toBe('categories')
  })
})

describe('buildMetaMetricsPdf', () => {
  it('produces a PDF', async () => {
    const bytes = await buildMetaMetricsPdf(report())
    expect(bytes).toBeInstanceOf(Uint8Array)
    // %PDF- magic number.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('makes one page per section', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(await buildMetaMetricsPdf(report()))
    expect(doc.getPageCount()).toBe(2)
  })

  it('survives a report with no sections at all', async () => {
    const bytes = await buildMetaMetricsPdf(report({ sections: [] }))
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(bytes)
    // Still a valid one-page document carrying the header and the strip.
    expect(doc.getPageCount()).toBe(1)
  })

  it('renders share view without throwing on percentage cells', async () => {
    const bytes = await buildMetaMetricsPdf(report({ view: 'share' }))
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('does not throw on a village with no requests', async () => {
    const rows = [...OUTCOME_ROWS, {
      villageId: '3', villageName: 'Empty Harbor', completed: 0, cancelled: 0, unmatched: 0, total: 0,
    }]
    const bytes = await buildMetaMetricsPdf(report({
      sections: [{ key: 'outcomes', title: 'Outcomes', rows, series: STATUS_SERIES, layout: 'grouped' }],
    }))
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })
})
