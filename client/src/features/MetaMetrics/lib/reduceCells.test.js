import { describe, it, expect } from 'vitest'
import { byVillage, cellTotal } from './reduceCells.js'

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


describe('byVillage with legs', () => {
  it('adds completedRoundTrips to completed when legs is true', () => {
    const rows = byVillage(CELLS, VILLAGES, { legs: true })
    const quahog = rows.find(r => r.villageId === '1')
    // completed 10+3 = 13, roundTrips 4+0 = 4
    expect(quahog.completed).toBe(17)
  })

  it('bumps total by the same amount so percentages stay coherent', () => {
    const rows = byVillage(CELLS, VILLAGES, { legs: true })
    const quahog = rows.find(r => r.villageId === '1')
    // base total 13+1+3+1 = 18, plus 4 legs
    expect(quahog.total).toBe(22)
    expect(quahog.completed + quahog.cancelled + quahog.unmatched).toBe(quahog.total)
  })

  it('leaves counts untouched when legs is false', () => {
    const rows = byVillage(CELLS, VILLAGES, { legs: false })
    const quahog = rows.find(r => r.villageId === '1')
    expect(quahog.completed).toBe(13)
    expect(quahog.total).toBe(18)
  })

  it('defaults legs to false when no options are passed', () => {
    const rows = byVillage(CELLS, VILLAGES)
    expect(rows.find(r => r.villageId === '1').completed).toBe(13)
  })

  it('still seeds granted villages that have no cells', () => {
    const rows = byVillage(CELLS, VILLAGES, { legs: true })
    const empty = rows.find(r => r.villageId === '3')
    expect(empty.total).toBe(0)
    expect(empty.completed).toBe(0)
  })
})
