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

// The Categories tab's series are the four category names, not the outcome
// keys, so the valid sort columns have to come from the caller rather than
// being hardcoded — otherwise sorting by "Rides" silently falls back to
// village name and the header arrow points at a sort that never happened.
describe('orderRows with a caller-supplied series set', () => {
  const CAT_ROWS = [
    { villageId: '1', villageName: 'Big', Rides: 400, Errands: 10, total: 410 },
    { villageId: '2', villageName: 'Mid', Rides: 100, Errands: 90, total: 190 },
    { villageId: '3', villageName: 'Small', Rides: 10, Errands: 40, total: 50 },
  ]
  const names = rows => rows.map(r => r.villageName)
  const KEYS = ['Rides', 'Errands']

  it('sorts by a category column when told those keys are valid', () => {
    const out = orderRows(CAT_ROWS, { sort: 'Errands', dir: 'desc', view: 'counts', seriesKeys: KEYS })
    expect(names(out)).toEqual(['Mid', 'Small', 'Big'])
  })

  it('sorts a category column by share of the row in share view', () => {
    // Small is 80% errands, Mid 47%, Big 2%.
    const out = orderRows(CAT_ROWS, { sort: 'Errands', dir: 'desc', view: 'share', seriesKeys: KEYS })
    expect(names(out)).toEqual(['Small', 'Mid', 'Big'])
  })

  it('still falls back to village name for a key outside the given set', () => {
    const out = orderRows(CAT_ROWS, { sort: 'completed', dir: 'asc', view: 'counts', seriesKeys: KEYS })
    expect(names(out)).toEqual(['Big', 'Mid', 'Small'])
  })

  it('defaults to the outcome keys when none are supplied', () => {
    const out = orderRows(ROWS, { sort: 'unmatched', dir: 'desc', view: 'counts' })
    expect(names(out)).toEqual(['Warwick', 'East Greenwich', 'Barrington', 'Empty Harbor'])
  })
})
