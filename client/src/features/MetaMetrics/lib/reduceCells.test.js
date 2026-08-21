import { describe, it, expect } from 'vitest'
import { byVillage, byServiceType, byCategory, cellTotal } from './reduceCells.js'

const S = (completed, unmatched, memberCancelled, volunteerCancelled) =>
  ({ completed, unmatched, memberCancelled, volunteerCancelled })

const VILLAGES = [
  { villageId: '1', villageName: 'Quahog' },
  { villageId: '2', villageName: 'Innsmouth' },
  { villageId: '3', villageName: 'Empty Harbor' },
]

const CELLS = [
  { villageId: '1', serviceName: 'Ride: Medical Appnt', category: 'Rides',       byStatus: S(10, 1, 2, 0), completedRoundTrips: 4 },
  { villageId: '1', serviceName: 'Errand: Shopping',    category: 'Errands',     byStatus: S(3, 0, 1, 1),  completedRoundTrips: 0 },
  { villageId: '2', serviceName: 'Ride: Medical Appnt', category: 'Rides',       byStatus: S(5, 2, 0, 0),  completedRoundTrips: 1 },
]

describe('cellTotal', () => {
  it('sums all four terminal statuses', () => {
    expect(cellTotal(S(10, 1, 2, 0))).toBe(13)
  })
})

describe('byVillage', () => {
  it('rolls cells up per village and merges the two cancels', () => {
    const rows = byVillage(CELLS, VILLAGES)
    const quahog = rows.find(r => r.villageId === '1')
    expect(quahog.completed).toBe(13)
    expect(quahog.cancelled).toBe(4)   // 2 + 0 + 1 + 1
    expect(quahog.unmatched).toBe(1)
    expect(quahog.total).toBe(18)
  })

  it('includes a granted village with no cells, at zero', () => {
    const rows = byVillage(CELLS, VILLAGES)
    const empty = rows.find(r => r.villageId === '3')
    expect(empty).toBeDefined()
    expect(empty.villageName).toBe('Empty Harbor')
    expect(empty.total).toBe(0)
  })

  it('sorts by total descending', () => {
    const rows = byVillage(CELLS, VILLAGES)
    expect(rows.map(r => r.villageId)).toEqual(['1', '2', '3'])
  })
})

describe('byServiceType', () => {
  it('sums the same serviceName across villages', () => {
    const rows = byServiceType(CELLS)
    const medical = rows.find(r => r.serviceName === 'Ride: Medical Appnt')
    expect(medical.completed).toBe(15)
    expect(medical.unmatched).toBe(3)
    expect(medical.total).toBe(18)
  })

  it('sorts by total descending', () => {
    expect(byServiceType(CELLS).map(r => r.serviceName))
      .toEqual(['Ride: Medical Appnt', 'Errand: Shopping'])
  })
})

describe('byCategory', () => {
  it('returns all four categories in fixed order, zero-filled', () => {
    const rows = byCategory(CELLS)
    expect(rows.map(r => r.category)).toEqual(['Rides', 'Errands', 'Home Help', 'Tech Support'])
    expect(rows.find(r => r.category === 'Tech Support').total).toBe(0)
  })

  it('ignores cells whose category is null', () => {
    const withNull = [...CELLS, { villageId: '1', serviceName: 'Mystery', category: null, byStatus: S(9, 0, 0, 0), completedRoundTrips: 0 }]
    const rows = byCategory(withNull)
    expect(rows.reduce((a, r) => a + r.total, 0)).toBe(21) // the 9 is excluded
  })
})
