import { describe, it, expect } from 'vitest'
import { CHART_COLUMNS, countColumns, chartCsvRows, csvFilename } from './metricsCsv.js'
import { toCsv } from '../../../shared/lib/csvUtils.js'

describe('metricsCsv', () => {
  it('exposes label/value/pct columns for legend tables', () => {
    expect(CHART_COLUMNS.map(c => c.key)).toEqual(['label', 'value', 'pct'])
  })

  it('names the count column after the role', () => {
    expect(countColumns('Member').map(c => c.header)).toEqual(['Member', 'Completed'])
    expect(countColumns('Volunteer')[0].header).toBe('Volunteer')
  })

  it('renders pct as a whole-number percent', () => {
    const rows = chartCsvRows([{ label: 'Rides', value: 704, pct: 0.8009 }])
    expect(rows[0].pct).toBe('80%')
  })

  it('renders a zero pct without NaN', () => {
    expect(chartCsvRows([{ label: 'None', value: 0, pct: 0 }])[0].pct).toBe('0%')
  })

  // The whole reason CSV quoting matters here: table names are "Last, First".
  it('quotes names containing commas', () => {
    const csv = toCsv([{ fullName: 'Anderson, Alice', count: 5 }], countColumns('Member'))
    expect(csv).toContain('"Anderson, Alice",5')
  })

  it('builds a filename carrying village, table, state and range', () => {
    expect(csvFilename({
      villageName: 'Sample Village', table: 'categories',
      state: 'completed', start: '2026-01-01', end: '2026-07-30',
    })).toBe('sample-village-categories-completed-2026-01-01-2026-07-30.csv')
  })

  it('omits the state segment when there is none', () => {
    expect(csvFilename({
      villageName: 'Sample Village', table: 'members',
      state: '', start: '2026-01-01', end: '2026-07-30',
    })).toBe('sample-village-members-2026-01-01-2026-07-30.csv')
  })

  it('slugs punctuation and spaces out of the village name', () => {
    expect(csvFilename({
      villageName: "St. Mary's Village", table: 'outcomes',
      state: '', start: '2026-01-01', end: '2026-07-30',
    })).toBe('st-marys-village-outcomes-2026-01-01-2026-07-30.csv')
  })
})
