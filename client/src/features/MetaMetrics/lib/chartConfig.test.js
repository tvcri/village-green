import { describe, it, expect } from 'vitest'
import { buildBarData, buildProportionalData, barOptions } from './chartConfig.js'

const ROWS = [
  { villageId: '1', villageName: 'Quahog',    completed: 60, cancelled: 28, unmatched: 0,  total: 88 },
  { villageId: '2', villageName: 'Innsmouth', completed: 26, cancelled: 10, unmatched: 8,  total: 44 },
]

describe('buildBarData', () => {
  it('emits one dataset per status series, in draw order', () => {
    const d = buildBarData(ROWS, 'villageName', { dark: false })
    expect(d.datasets.map(s => s.label)).toEqual(['Completed', 'Cancelled', 'Unmatched'])
    expect(d.labels).toEqual(['Quahog', 'Innsmouth'])
    expect(d.datasets[0].data).toEqual([60, 26])
    expect(d.datasets[1].data).toEqual([28, 10])
  })

  it('uses the light palette when dark is false', () => {
    expect(buildBarData(ROWS, 'villageName', { dark: false }).datasets[0].backgroundColor).toBe('#1d4ed8')
  })

  it('uses the dark palette when dark is true', () => {
    expect(buildBarData(ROWS, 'villageName', { dark: true }).datasets[0].backgroundColor).toBe('#3b82f6')
  })
})

describe('buildProportionalData', () => {
  it('converts each row to percentages summing to 100', () => {
    const d = buildProportionalData(ROWS, 'villageName', { dark: false })
    const first = d.datasets.map(s => s.data[0])
    expect(Math.round(first.reduce((a, b) => a + b, 0))).toBe(100)
  })

  it('emits zeros rather than NaN for an all-zero row', () => {
    const d = buildProportionalData(
      [{ villageName: 'Empty', completed: 0, cancelled: 0, unmatched: 0, total: 0 }],
      'villageName', { dark: false }
    )
    expect(d.datasets.map(s => s.data[0])).toEqual([0, 0, 0])
  })
})

describe('barOptions', () => {
  it('is always horizontal', () => {
    expect(barOptions({ stacked: false, percent: false }).indexAxis).toBe('y')
  })

  it('caps the x axis at 100 in percent mode', () => {
    expect(barOptions({ stacked: true, percent: true }).scales.x.max).toBe(100)
  })

  it('leaves the x axis unbounded in count mode', () => {
    expect(barOptions({ stacked: false, percent: false }).scales.x.max).toBeUndefined()
  })
})
