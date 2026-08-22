import { describe, it, expect } from 'vitest'
import { barSegments, isStackedLayout } from './barGeometry.js'
import { STATUS_SERIES } from './reduceCells.js'

const ROWS = [
  { villageId: '1', villageName: 'Barrington', completed: 671, cancelled: 136, unmatched: 2, total: 809 },
  { villageId: '2', villageName: 'Warwick', completed: 298, cancelled: 90, unmatched: 87, total: 475 },
  { villageId: '3', villageName: 'Wood River', completed: 62, cancelled: 6, unmatched: 0, total: 68 },
  { villageId: '4', villageName: 'Empty Harbor', completed: 0, cancelled: 0, unmatched: 0, total: 0 },
]

describe('counts view', () => {
  it('makes the largest single segment exactly full width', () => {
    // Scaled against the largest SEGMENT (Barrington's 671 completed), not the
    // largest row TOTAL. Counts never draws a total, so scaling to one would
    // leave the longest bar permanently short of its container's end.
    const { segments: segs } = barSegments(ROWS, STATUS_SERIES, 'counts')
    expect(segs[0].find(s => s.key === 'completed').width).toBeCloseTo(100, 6)
  })

  it('scales every other bar against that same segment, so lengths compare', () => {
    const { segments: segs } = barSegments(ROWS, STATUS_SERIES, 'counts')
    const barrington = segs[0].find(s => s.key === 'completed').width
    const warwick = segs[1].find(s => s.key === 'completed').width
    expect(warwick / barrington).toBeCloseTo(298 / 671, 2)
  })

  it('floors a nonzero value so it never rounds away to nothing', () => {
    const { segments: segs } = barSegments(ROWS, STATUS_SERIES, 'counts')
    // Wood River's 6 cancelled against a 671 max is 0.9% — under the floor.
    const cancelled = segs[2].find(s => s.key === 'cancelled')
    expect(cancelled.width).toBeGreaterThan(0)
  })

  it('gives a zero value zero width — a sliver would be a lie', () => {
    const { segments: segs } = barSegments(ROWS, STATUS_SERIES, 'counts')
    expect(segs[2].find(s => s.key === 'unmatched').width).toBe(0)
  })

  it('renders an all-zero row as an empty bar rather than NaN', () => {
    const { segments: segs } = barSegments(ROWS, STATUS_SERIES, 'counts')
    for (const s of segs[3]) expect(s.width).toBe(0)
  })
})

describe('share view', () => {
  it('totals 100% for every row regardless of magnitude', () => {
    const { segments: segs } = barSegments(ROWS, STATUS_SERIES, 'percent')
    const big = segs[0].reduce((sum, s) => sum + s.width, 0)
    const small = segs[2].reduce((sum, s) => sum + s.width, 0)
    expect(big).toBeCloseTo(100, 6)
    expect(small).toBeCloseTo(100, 6)
  })

  it('sizes each segment by its share of that row', () => {
    const { segments: segs } = barSegments(ROWS, STATUS_SERIES, 'percent')
    const warwickUnmatched = segs[1].find(s => s.key === 'unmatched')
    expect(warwickUnmatched.width).toBeCloseTo(87 / 475 * 100, 2)
  })

  it('leaves an all-zero row empty rather than dividing by zero', () => {
    const { segments: segs } = barSegments(ROWS, STATUS_SERIES, 'percent')
    for (const s of segs[3]) expect(s.width).toBe(0)
  })
})

describe('segment identity', () => {
  it('carries the series key, label and both theme colors for every segment', () => {
    const [first] = barSegments(ROWS, STATUS_SERIES, 'counts').segments
    expect(first.map(s => s.key)).toEqual(['completed', 'cancelled', 'unmatched'])
    expect(first[0]).toMatchObject({
      label: 'Completed',
      colorLight: '#1d4ed8',
      colorDark: '#3b82f6',
    })
  })

  it('carries the raw value so a tooltip can state it', () => {
    const [first] = barSegments(ROWS, STATUS_SERIES, 'counts').segments
    expect(first.map(s => s.value)).toEqual([671, 136, 2])
  })
})

// The Categories tab stacks in BOTH views, because categories genuinely
// partition a village's work — unlike outcomes, which do not compose and so
// draw as separate bars. In its counts view the bar's LENGTH carries the
// village's total work while the segments carry the mix.
describe('stacked layout (the Categories tab)', () => {
  const CAT = [
    { key: 'Rides', label: 'Rides', colorLight: '#22c55e', colorDark: '#4ade80' },
    { key: 'Errands', label: 'Errands', colorLight: '#f59e0b', colorDark: '#fbbf24' },
  ]
  const CROWS = [
    { villageId: '1', villageName: 'Big', Rides: 400, Errands: 100, total: 500 },
    { villageId: '2', villageName: 'Small', Rides: 40, Errands: 10, total: 50 },
    { villageId: '3', villageName: 'None', Rides: 0, Errands: 0, total: 0 },
  ]

  it('makes the busiest village a full-width bar in counts', () => {
    const { segments, trackPct } = barSegments(CROWS, CAT, 'counts', { layout: 'stacked' })
    expect(trackPct[0]).toBeCloseTo(100, 6)
    // Segments are proportions WITHIN that track, so they still sum to 100.
    expect(segments[0].reduce((s, x) => s + x.width, 0)).toBeCloseTo(100, 6)
  })

  it('shortens a quieter village’s bar in proportion to its total work', () => {
    const { trackPct } = barSegments(CROWS, CAT, 'counts', { layout: 'stacked' })
    expect(trackPct[1]).toBeCloseTo(10, 6) // 50 of 500
  })

  it('gives every village a full-width bar in share', () => {
    const { trackPct } = barSegments(CROWS, CAT, 'percent', { layout: 'stacked' })
    expect(trackPct[0]).toBeCloseTo(100, 6)
    expect(trackPct[1]).toBeCloseTo(100, 6)
  })

  it('renders a village with no work as no bar rather than NaN', () => {
    const { segments, trackPct } = barSegments(CROWS, CAT, 'counts', { layout: 'stacked' })
    expect(trackPct[2]).toBe(0)
    for (const seg of segments[2]) expect(seg.width).toBe(0)
  })
})

// Screen and PDF both ask this, so the rule cannot drift between them. It did:
// the PDF hardcoded `layout === 'stacked'` and drew grouped bars in share view
// while the screen stacked them.
describe('isStackedLayout', () => {
  it('stacks whenever the view is share, whatever the tab asked for', () => {
    expect(isStackedLayout('grouped', 'percent')).toBe(true)
    expect(isStackedLayout('stacked', 'percent')).toBe(true)
  })

  it('honours the tab in counts view', () => {
    expect(isStackedLayout('grouped', 'counts')).toBe(false)
    expect(isStackedLayout('stacked', 'counts')).toBe(true)
  })
})
