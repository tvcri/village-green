import { describe, it, expect } from 'vitest'
import { metaStripStats } from './stripStats.js'

const ROWS = [
  { villageId: '1', villageName: 'Barrington',   completed: 624, cancelled: 291, unmatched: 4, total: 919 },
  { villageId: '2', villageName: 'Empty Harbor', completed: 0,   cancelled: 0,   unmatched: 0, total: 0 },
]

describe('metaStripStats', () => {
  it('counts every village in scope, including those with no requests', () => {
    expect(metaStripStats(ROWS).villages).toBe(2)
  })

  it('sums requests and each outcome', () => {
    expect(metaStripStats(ROWS)).toMatchObject({
      requests: 919, completed: 624, cancelled: 291, unmatched: 4,
    })
  })

  it('returns zeroes for an empty scope', () => {
    expect(metaStripStats([])).toMatchObject({
      villages: 0, requests: 0, completed: 0, cancelled: 0, unmatched: 0,
    })
  })
})

// "5,161 completed" does not read as a rate at a glance, and the rate is what a
// director quotes. Only the three outcome cards get one, and they do not share
// a base: Completed and Cancelled are shares of Requests ("of all"); the
// unmatched rate leaves cancelled requests out ("of not cancelled"). Villages
// and Requests have no denominator, and a percentage there would be noise.
describe('metaStripStats percentages', () => {
  const ROWS = [
    { villageId: '1', villageName: 'A', completed: 800, cancelled: 150, unmatched: 50, total: 1000 },
    { villageId: '2', villageName: 'B', completed: 200, cancelled: 50, unmatched: 0, total: 250 },
  ]

  it('gives completed and cancelled their share of requests', () => {
    const s = metaStripStats(ROWS)
    expect(s.completedPct).toBeCloseTo(80, 6)  // 1000 / 1250
    expect(s.cancelledPct).toBeCloseTo(16, 6)  // 200 / 1250
  })

  it('gives unmatched its rate among requests not cancelled', () => {
    const s = metaStripStats(ROWS)
    // 50 / (50 + 1000), not 50 / 1250
    expect(s.unmatchedPct).toBeCloseTo(50 / 1050 * 100, 6)
  })

  it('names each percentage\'s base', () => {
    const s = metaStripStats(ROWS)
    expect(s.completedPctBase).toBe('of all')
    expect(s.cancelledPctBase).toBe('of all')
    expect(s.unmatchedPctBase).toBe('of not cancelled')
  })

  it('gives villages and requests no percentage — they have no denominator', () => {
    const s = metaStripStats(ROWS)
    expect(s.villagesPct).toBeUndefined()
    expect(s.requestsPct).toBeUndefined()
  })

  it('returns null percentages rather than NaN when there are no requests', () => {
    const s = metaStripStats([])
    expect(s.completedPct).toBeNull()
    expect(s.cancelledPct).toBeNull()
    expect(s.unmatchedPct).toBeNull()
  })

  it('returns a null unmatched rate when everything was cancelled', () => {
    const s = metaStripStats([
      { villageId: '1', villageName: 'A', completed: 0, cancelled: 7, unmatched: 0, total: 7 },
    ])
    expect(s.unmatchedPct).toBeNull()
    expect(s.cancelledPct).toBeCloseTo(100, 6)
  })
})
