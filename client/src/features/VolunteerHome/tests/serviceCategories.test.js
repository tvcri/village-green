import { describe, it, expect } from 'vitest'
import { SERVICE_CATEGORIES, filterQualifying } from '../lib/serviceCategories.js'

const jane = { personId: '7', name: 'Jane Doe', capabilities: ['Rides', 'Errands'] }
const john = { personId: '8', name: 'John Doe', capabilities: ['Tech Support'] }

describe('SERVICE_CATEGORIES', () => {
  it('maps the four VSS capabilities to serviceName prefixes', () => {
    expect(SERVICE_CATEGORIES.map(c => c.label).sort()).toEqual(
      ['Errands', 'Home Help', 'Rides', 'Tech Support']
    )
  })
})

describe('filterQualifying', () => {
  it('keeps only volunteers whose capabilities cover the serviceName', () => {
    expect(filterQualifying([jane, john], 'Ride: Medical Appointment')).toEqual([jane])
    expect(filterQualifying([jane, john], 'Tech Support')).toEqual([john])
  })

  it('absorbs the legacy whitespace-after-colon serviceName variants', () => {
    expect(filterQualifying([jane], 'Errand: Shopping')).toEqual([jane])
    expect(filterQualifying([jane], 'Errand:Shopping')).toEqual([jane])
  })

  it('returns [] for uncovered, absent, or null serviceNames and empty input', () => {
    expect(filterQualifying([jane], 'Friendly Visit')).toEqual([])
    expect(filterQualifying([jane], null)).toEqual([])
    expect(filterQualifying([], 'Ride: Medical Appointment')).toEqual([])
    expect(filterQualifying(undefined, 'Ride: Medical Appointment')).toEqual([])
  })
})
