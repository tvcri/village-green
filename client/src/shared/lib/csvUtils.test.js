import { describe, it, expect } from 'vitest'
import { buildFlagColumns, withFlagValues, toCsv } from './csvUtils.js'

const rows = [
  { fullName: 'Anderson, Alice', capabilities: ['Rides', 'Errands'] },
  { fullName: 'Baker, Bob', capabilities: ['Errands'] },
  { fullName: 'Chen, Cass', capabilities: [] }
]

describe('buildFlagColumns', () => {
  it('derives one column per distinct value, alphabetized', () => {
    const { columns, values } = buildFlagColumns(rows, 'capabilities')
    expect(values).toEqual(['Errands', 'Rides'])
    expect(columns.map(c => c.header)).toEqual(['Errands', 'Rides'])
  })

  it('only includes values present in the rows given', () => {
    const filtered = [{ capabilities: ['Rides'] }]
    expect(buildFlagColumns(filtered, 'capabilities').values).toEqual(['Rides'])
  })

  it('returns no columns for empty or missing rows', () => {
    expect(buildFlagColumns([], 'capabilities').columns).toEqual([])
    expect(buildFlagColumns(undefined, 'capabilities').columns).toEqual([])
  })

  it('tolerates rows missing the field', () => {
    expect(buildFlagColumns([{ fullName: 'x' }], 'capabilities').values).toEqual([])
  })

  it('carries a Sheets number format that keeps the value numeric', () => {
    const { columns } = buildFlagColumns(rows, 'capabilities')
    expect(columns[0].numberFormat).toEqual({
      type: 'NUMBER',
      pattern: '[=1]"✓";[=0]"";General'
    })
  })
})

describe('withFlagValues', () => {
  const values = ['Errands', 'Rides']

  it('emits 1 for held values and 0 for the rest', () => {
    expect(withFlagValues(rows[0], 'capabilities', values)).toEqual({
      'capabilities:Errands': 1,
      'capabilities:Rides': 1
    })
    expect(withFlagValues(rows[1], 'capabilities', values)).toEqual({
      'capabilities:Errands': 1,
      'capabilities:Rides': 0
    })
  })

  it('emits all zeros for a row holding none', () => {
    expect(withFlagValues(rows[2], 'capabilities', values)).toEqual({
      'capabilities:Errands': 0,
      'capabilities:Rides': 0
    })
  })

  it('uses numbers, not strings, so a spreadsheet can sum them', () => {
    const flags = withFlagValues(rows[0], 'capabilities', values)
    expect(typeof flags['capabilities:Errands']).toBe('number')
  })
})

describe('toCsv with flag columns', () => {
  it('renders flags as 1/0 and ignores numberFormat', () => {
    const { columns, values } = buildFlagColumns(rows, 'capabilities')
    const exportRows = rows.map(r => ({ ...r, ...withFlagValues(r, 'capabilities', values) }))
    const csv = toCsv(exportRows, [{ header: 'Full Name', key: 'fullName' }, ...columns])
    expect(csv.split('\n')).toEqual([
      'Full Name,Errands,Rides',
      '"Anderson, Alice",1,1',
      '"Baker, Bob",1,0',
      '"Chen, Cass",0,0'
    ])
  })
})
