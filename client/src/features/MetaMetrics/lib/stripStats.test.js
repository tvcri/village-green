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
// director quotes. Only the three outcome cards get one: they are shares of
// Requests and sum to 100%. Villages and Requests have no denominator, and a
// percentage there would be noise.
describe('metaStripStats percentages', () => {
  const ROWS = [
    { villageId: '1', villageName: 'A', completed: 800, cancelled: 150, unmatched: 50, total: 1000 },
    { villageId: '2', villageName: 'B', completed: 200, cancelled: 50, unmatched: 0, total: 250 },
  ]

  it('gives each outcome its share of requests', () => {
    const s = metaStripStats(ROWS)
    expect(s.completedPct).toBeCloseTo(80, 1)
    expect(s.cancelledPct).toBeCloseTo(16, 1)
    expect(s.unmatchedPct).toBeCloseTo(4, 1)
  })

  it('has the three shares sum to a hundred', () => {
    const s = metaStripStats(ROWS)
    expect(s.completedPct + s.cancelledPct + s.unmatchedPct).toBeCloseTo(100, 6)
  })

  it('gives villages and requests no percentage — they have no denominator', () => {
    const s = metaStripStats(ROWS)
    expect(s.villagesPct).toBeUndefined()
    expect(s.requestsPct).toBeUndefined()
  })

  it('returns null shares rather than NaN when there are no requests', () => {
    const s = metaStripStats([])
    expect(s.completedPct).toBeNull()
    expect(s.cancelledPct).toBeNull()
    expect(s.unmatchedPct).toBeNull()
  })
})
