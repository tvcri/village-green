import { describe, it, expect } from 'vitest'
import { orderRows, DEFAULT_SORT } from './orderRows.js'

const ROWS = [
  { villageId: '1', villageName: 'Warwick',        completed: 268, cancelled: 118, unmatched: 92, total: 478 },
  { villageId: '2', villageName: 'Barrington',     completed: 624, cancelled: 291, unmatched: 4,  total: 919 },
  { villageId: '3', villageName: 'East Greenwich', completed: 88,  cancelled: 61,  unmatched: 44, total: 193 },
  { villageId: '4', villageName: 'Empty Harbor',   completed: 0,   cancelled: 0,   unmatched: 0,  total: 0 },
]

const names = rows => rows.map(r => r.villageName)

describe('DEFAULT_SORT', () => {
  it('is village name ascending, not total descending', () => {
    expect(DEFAULT_SORT).toEqual({ sort: 'villageName', dir: 'asc' })
  })
})

describe('orderRows', () => {
  it('sorts by village name ascending by default', () => {
    expect(names(orderRows(ROWS, { sort: 'villageName', dir: 'asc', view: 'counts' })))
      .toEqual(['Barrington', 'East Greenwich', 'Empty Harbor', 'Warwick'])
  })

  it('sorts by village name descending', () => {
    expect(names(orderRows(ROWS, { sort: 'villageName', dir: 'desc', view: 'counts' })))
      .toEqual(['Warwick', 'Empty Harbor', 'East Greenwich', 'Barrington'])
  })

  it('sorts by a series column as a raw count in counts view', () => {
    expect(names(orderRows(ROWS, { sort: 'unmatched', dir: 'desc', view: 'counts' })))
      .toEqual(['Warwick', 'East Greenwich', 'Barrington', 'Empty Harbor'])
  })

  it('sorts by a series column as a SHARE of total in share view', () => {
    // East Greenwich 44/193 = 22.8% beats Warwick 92/478 = 19.2%
    expect(names(orderRows(ROWS, { sort: 'unmatched', dir: 'desc', view: 'share' })))
      .toEqual(['East Greenwich', 'Warwick', 'Barrington', 'Empty Harbor'])
  })

  it('treats a zero-total village as zero share rather than NaN', () => {
    const ordered = orderRows(ROWS, { sort: 'completed', dir: 'asc', view: 'share' })
    expect(ordered[0].villageName).toBe('Empty Harbor')
  })

  it('sorts by total', () => {
    expect(names(orderRows(ROWS, { sort: 'total', dir: 'desc', view: 'counts' })))
      .toEqual(['Barrington', 'Warwick', 'East Greenwich', 'Empty Harbor'])
  })

  it('falls back to village name for an unknown sort key', () => {
    expect(names(orderRows(ROWS, { sort: 'banana', dir: 'asc', view: 'counts' })))
      .toEqual(['Barrington', 'East Greenwich', 'Empty Harbor', 'Warwick'])
  })

  it('does not mutate the input array', () => {
    const before = names(ROWS)
    orderRows(ROWS, { sort: 'total', dir: 'desc', view: 'counts' })
    expect(names(ROWS)).toEqual(before)
  })
})
