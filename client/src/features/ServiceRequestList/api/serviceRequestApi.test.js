import { describe, it, expect } from 'vitest'
import { withDisplayNumber } from './serviceRequestApi.js'

describe('withDisplayNumber', () => {
  it('uses requestNumber when present', () => {
    const [row] = withDisplayNumber([{ requestNumber: 42, serviceRequestId: '1001' }])
    expect(row.displayNumber).toBe(42)
  })

  it('falls back to numeric serviceRequestId when requestNumber is null', () => {
    const [row] = withDisplayNumber([{ requestNumber: null, serviceRequestId: '1001' }])
    expect(row.displayNumber).toBe(1001)
  })

  it('falls back when requestNumber is undefined (key absent)', () => {
    const [row] = withDisplayNumber([{ serviceRequestId: '2002' }])
    expect(row.displayNumber).toBe(2002)
  })

  it('preserves a legitimate requestNumber of 0', () => {
    const [row] = withDisplayNumber([{ requestNumber: 0, serviceRequestId: '5' }])
    expect(row.displayNumber).toBe(0)
  })

  it('produces sortable numbers in one flat numeric line', () => {
    const rows = withDisplayNumber([
      { requestNumber: 3, serviceRequestId: '9999' },
      { requestNumber: null, serviceRequestId: '1001' },
      { requestNumber: 1, serviceRequestId: '8888' },
    ])
    const sorted = [...rows].sort((a, b) => a.displayNumber - b.displayNumber)
    expect(sorted.map(r => r.displayNumber)).toEqual([1, 3, 1001])
  })

  it('preserves other row fields', () => {
    const [row] = withDisplayNumber([{ requestNumber: 7, status: 'open', serviceName: 'Ride' }])
    expect(row).toMatchObject({ requestNumber: 7, status: 'open', serviceName: 'Ride' })
  })

  it('returns an empty array for non-array input', () => {
    expect(withDisplayNumber(null)).toEqual([])
    expect(withDisplayNumber(undefined)).toEqual([])
  })
})
