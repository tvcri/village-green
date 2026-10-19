import { describe, it, expect } from 'vitest'
import { toCsv } from '../../../shared/lib/csvUtils.js'
import { labelCsvColumns, labelRowsForCsv } from './labelsCsv.js'

const label = {
  name: 'Barbara and Robert Miller',
  salutations: {
    firstName: 'Barbara and Robert',
    nickname: 'Barb and Bob',
    fullName: 'Barbara and Robert Miller',
  },
  street: '12 Elm St',
  unit: null,
  city: 'Warren',
  state: 'RI',
  zip: '02885',
  sortLastName: 'Miller',
}

describe('label CSV', () => {
  it('leads with the three salutations and keeps the zip leading zero', () => {
    const [header, row] = toCsv(labelRowsForCsv([label]), labelCsvColumns).split('\n')
    expect(header).toBe('Salutation,Salutation Nickname,Salutation Full Name,Name,Street,Unit,City,State,Zip')
    expect(row).toBe('Barbara and Robert,Barb and Bob,Barbara and Robert Miller,Barbara and Robert Miller,12 Elm St,,Warren,RI,02885')
  })

  it('does not export the internal sort key', () => {
    expect(labelCsvColumns.map(c => c.key)).not.toContain('sortLastName')
  })
})
