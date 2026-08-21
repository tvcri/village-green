import { describe, it, expect } from 'vitest'
import { matrixColumns, matrixCells, matrixFooter, metaCsvFilename } from './matrixTable.js'
import { STATUS_SERIES } from './reduceCells.js'

const ROWS = [
  { villageId: '1', villageName: 'Barrington',     completed: 624, cancelled: 291, unmatched: 4,  total: 919 },
  { villageId: '2', villageName: 'East Greenwich', completed: 88,  cancelled: 61,  unmatched: 44, total: 193 },
  { villageId: '3', villageName: 'Empty Harbor',   completed: 0,   cancelled: 0,   unmatched: 0,  total: 0 },
]

describe('matrixColumns', () => {
  it('is Village, the series, then Total in counts view', () => {
    expect(matrixColumns(STATUS_SERIES, 'counts').map(c => c.header))
      .toEqual(['Village', 'Completed', 'Cancelled', 'Unmatched', 'Total'])
  })

  it('names the last column Requests in share view', () => {
    expect(matrixColumns(STATUS_SERIES, 'share').map(c => c.header))
      .toEqual(['Village', 'Completed', 'Cancelled', 'Unmatched', 'Requests'])
  })
})

describe('matrixCells', () => {
  it('emits integers in counts view', () => {
    const [first] = matrixCells(ROWS, STATUS_SERIES, 'counts')
    expect(first).toMatchObject({ villageName: 'Barrington', completed: 624, total: 919 })
  })

  it('emits one-decimal percentages in share view', () => {
    const cells = matrixCells(ROWS, STATUS_SERIES, 'share')
    expect(cells[1]).toMatchObject({ villageName: 'East Greenwich', unmatched: '22.8%' })
  })

  it('keeps the absolute request count as the last column in share view', () => {
    const cells = matrixCells(ROWS, STATUS_SERIES, 'share')
    expect(cells[1].total).toBe(193)
  })

  it('renders a zero-total village as 0.0% rather than NaN', () => {
    const cells = matrixCells(ROWS, STATUS_SERIES, 'share')
    expect(cells[2].completed).toBe('0.0%')
  })
})

describe('matrixFooter', () => {
  it('sums each series in counts view and is labelled Total', () => {
    const foot = matrixFooter(ROWS, STATUS_SERIES, 'counts')
    expect(foot).toMatchObject({ villageName: 'Total', completed: 712, unmatched: 48, total: 1112 })
  })

  it('is a hub-wide rate labelled Hub in share view', () => {
    const foot = matrixFooter(ROWS, STATUS_SERIES, 'share')
    // 712 / 1112 = 64.0%
    expect(foot).toMatchObject({ villageName: 'Hub', completed: '64.0%', total: 1112 })
  })
})

describe('metaCsvFilename', () => {
  it('carries tab, view and range', () => {
    expect(metaCsvFilename({ tab: 'outcomes', view: 'share', start: '2026-01-01', end: '2026-08-21' }))
      .toBe('meta-outcomes-share-2026-01-01-2026-08-21.csv')
  })
})

// The Categories columns are wide enough to wrap their headers onto two lines,
// which makes the header row taller than the others need. A series may carry a
// shortLabel for the header only — the full label still names the bar segment
// and the CSV column, where there is room for it.
describe('shortLabel', () => {
  const SERIES = [
    { key: 'Rides', label: 'Rides' },
    { key: 'Home Help', label: 'Home Help', shortLabel: 'Home' },
  ]

  it('uses the short label for a column header when one is given', () => {
    expect(matrixColumns(SERIES, 'counts').map(c => c.header))
      .toEqual(['Village', 'Rides', 'Home', 'Total'])
  })

  it('falls back to the full label when there is no short one', () => {
    expect(matrixColumns([{ key: 'Rides', label: 'Rides' }], 'counts')[1].header).toBe('Rides')
  })

  it('keeps the full label as the CSV header, where width is not a constraint', () => {
    expect(matrixColumns(SERIES, 'counts', { full: true }).map(c => c.header))
      .toEqual(['Village', 'Rides', 'Home Help', 'Total'])
  })
})
