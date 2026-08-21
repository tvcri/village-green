import { describe, it, expect } from 'vitest'
import { barSegments, BAR_TRACK_PX } from './barGeometry.js'
import { STATUS_SERIES } from './reduceCells.js'

const ROWS = [
  { villageId: '1', villageName: 'Barrington', completed: 671, cancelled: 136, unmatched: 2, total: 809 },
  { villageId: '2', villageName: 'Warwick', completed: 298, cancelled: 90, unmatched: 87, total: 475 },
  { villageId: '3', villageName: 'Wood River', completed: 62, cancelled: 6, unmatched: 0, total: 68 },
  { villageId: '4', villageName: 'Empty Harbor', completed: 0, cancelled: 0, unmatched: 0, total: 0 },
]

describe('counts view', () => {
  it('scales every row against the largest row total, not its own', () => {
    const segs = barSegments(ROWS, STATUS_SERIES, 'counts')
    // Barrington is the max, so its three widths fill the whole track.
    const barrington = segs[0].reduce((sum, s) => sum + s.width, 0)
    expect(barrington).toBeCloseTo(BAR_TRACK_PX, 0)
    // Warwick's total is 475/809 of the max, so its bar is that fraction.
    const warwick = segs[1].reduce((sum, s) => sum + s.width, 0)
    expect(warwick / barrington).toBeCloseTo(475 / 809, 2)
  })

  it('gives a nonzero value at least one pixel so it never vanishes', () => {
    const segs = barSegments(ROWS, STATUS_SERIES, 'counts')
    // Wood River's 6 cancelled against a 809 max is well under a pixel.
    const cancelled = segs[2].find(s => s.key === 'cancelled')
    expect(cancelled.width).toBeGreaterThanOrEqual(1)
  })

  it('gives a zero value zero width — a sliver would be a lie', () => {
    const segs = barSegments(ROWS, STATUS_SERIES, 'counts')
    expect(segs[2].find(s => s.key === 'unmatched').width).toBe(0)
  })

  it('renders an all-zero row as an empty bar rather than NaN', () => {
    const segs = barSegments(ROWS, STATUS_SERIES, 'counts')
    for (const s of segs[3]) expect(s.width).toBe(0)
  })
})

describe('share view', () => {
  it('is expressed as a percentage so the bar fills whatever cell it lands in', () => {
    // Deliberately NOT pixels: a fixed px track left a ragged gap at the right
    // edge, which undercuts the one thing a share bar asserts — that this is
    // the whole of this village.
    const segs = barSegments(ROWS, STATUS_SERIES, 'share')
    for (const seg of segs[0]) expect(seg.unit).toBe('%')
  })

  it('totals 100% for every row regardless of magnitude', () => {
    const segs = barSegments(ROWS, STATUS_SERIES, 'share')
    const big = segs[0].reduce((sum, s) => sum + s.width, 0)
    const small = segs[2].reduce((sum, s) => sum + s.width, 0)
    expect(big).toBeCloseTo(100, 6)
    expect(small).toBeCloseTo(100, 6)
  })

  it('sizes each segment by its share of that row', () => {
    const segs = barSegments(ROWS, STATUS_SERIES, 'share')
    const warwickUnmatched = segs[1].find(s => s.key === 'unmatched')
    expect(warwickUnmatched.width).toBeCloseTo(87 / 475 * 100, 2)
  })

  it('leaves an all-zero row empty rather than dividing by zero', () => {
    const segs = barSegments(ROWS, STATUS_SERIES, 'share')
    for (const s of segs[3]) expect(s.width).toBe(0)
  })
})

describe('segment identity', () => {
  it('carries the series key, label and both theme colors for every segment', () => {
    const [first] = barSegments(ROWS, STATUS_SERIES, 'counts')
    expect(first.map(s => s.key)).toEqual(['completed', 'cancelled', 'unmatched'])
    expect(first[0]).toMatchObject({
      label: 'Completed',
      colorLight: '#1d4ed8',
      colorDark: '#3b82f6',
    })
  })

  it('marks counts widths as pixels, since they share a cross-row scale', () => {
    const [first] = barSegments(ROWS, STATUS_SERIES, 'counts')
    for (const seg of first) expect(seg.unit).toBe('px')
  })

  it('carries the raw value so a tooltip can state it', () => {
    const [first] = barSegments(ROWS, STATUS_SERIES, 'counts')
    expect(first.map(s => s.value)).toEqual([671, 136, 2])
  })
})
