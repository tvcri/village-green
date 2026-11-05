import { describe, it, expect } from 'vitest'
import {
  emptyDestination, isBlankDestination, destinationsForSave,
  summarize, joinField, withDestinationColumns, placeQuery
} from './destinations.js'

describe('summarize', () => {
  it('returns empty string for none', () => {
    expect(summarize([], 'city')).toBe('')
  })
  it('returns the lone value alone', () => {
    expect(summarize([{ city: 'Wakefield' }], 'city')).toBe('Wakefield')
  })
  it('adds a +N count for extras', () => {
    const two = [{ city: 'Wakefield' }, { city: 'Kingston' }]
    expect(summarize(two, 'city')).toBe('Wakefield +1')
    expect(summarize([...two, { city: 'Newport' }], 'city')).toBe('Wakefield +2')
  })
  it('shows a dash for a null first value when there are extras', () => {
    expect(summarize([{ city: null }, { city: 'Kingston' }], 'city')).toBe('— +1')
  })
})

describe('joinField', () => {
  it('keeps position with empty slots', () => {
    const d = [{ city: 'Wakefield' }, { city: null }, { city: 'Kingston' }]
    expect(joinField(d, 'city')).toBe('Wakefield; ; Kingston')
  })
})

describe('withDestinationColumns', () => {
  it('adds flat joined columns and tolerates missing destinations', () => {
    const rows = withDestinationColumns([
      { id: 1, destinations: [{ destination: 'A', address: '1 Main', city: 'X', state: 'RI' }, { destination: 'B', address: null, city: 'Y', state: 'RI' }] },
      { id: 2 }
    ])
    expect(rows[0]).toMatchObject({ destination: 'A; B', address: '1 Main; ', city: 'X; Y', state: 'RI; RI' })
    expect(rows[1]).toMatchObject({ destination: '', address: '', city: '', state: '' })
  })
})

describe('destinationsForSave', () => {
  it('drops a lone fully blank block', () => {
    expect(destinationsForSave([emptyDestination()])).toEqual([])
  })
  it('keeps a blank second block so validation can catch it', () => {
    const out = destinationsForSave([{ ...emptyDestination(), destination: 'Clinic' }, emptyDestination()])
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ destination: 'Clinic', address: null, city: null, state: null, zip: null, phone: null })
    expect(out[1]).toEqual({ destination: null, address: null, city: null, state: null, zip: null, phone: null })
  })
})

describe('isBlankDestination', () => {
  it('is true only when every field is empty', () => {
    expect(isBlankDestination(emptyDestination())).toBe(true)
    expect(isBlankDestination({ ...emptyDestination(), zip: '02879' })).toBe(false)
  })
})

describe('placeQuery', () => {
  it('is empty for a name-only destination', () => {
    expect(placeQuery({ ...emptyDestination(), destination: 'Clinic' })).toBe('')
  })
  it('joins address, city, state', () => {
    expect(placeQuery({ address: '1 Main St', city: 'Wakefield', state: 'RI' })).toBe('1 Main St, Wakefield, RI')
    expect(placeQuery({ city: 'Wakefield', state: 'RI' })).toBe('Wakefield, RI')
  })
})
