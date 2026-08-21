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
