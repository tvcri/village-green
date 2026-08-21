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
    expect(metaStripStats([])).toEqual({
      villages: 0, requests: 0, completed: 0, cancelled: 0, unmatched: 0,
    })
  })
})
