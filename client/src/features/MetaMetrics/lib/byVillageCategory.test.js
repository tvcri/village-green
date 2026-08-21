import { describe, it, expect } from 'vitest'
import { byVillageCategory, CATEGORY_SERIES } from './byVillageCategory.js'

const S = (completed, unmatched, memberCancelled, volunteerCancelled) =>
  ({ completed, unmatched, memberCancelled, volunteerCancelled })

const VILLAGES = [
  { villageId: '1', villageName: 'Quahog' },
  { villageId: '2', villageName: 'Innsmouth' },
  { villageId: '3', villageName: 'Empty Harbor' },
]

const CELLS = [
  { villageId: '1', serviceName: 'Ride: Medical Appnt', category: 'Rides', byStatus: S(10, 1, 2, 0), completedRoundTrips: 4 },
  { villageId: '1', serviceName: 'Ride: Shopping', category: 'Rides', byStatus: S(5, 0, 0, 0), completedRoundTrips: 1 },
  { villageId: '1', serviceName: 'Errand: Pharmacy', category: 'Errands', byStatus: S(3, 0, 1, 1), completedRoundTrips: 0 },
  { villageId: '2', serviceName: 'Tech Support: Phone', category: 'Tech Support', byStatus: S(7, 2, 0, 0), completedRoundTrips: 0 },
  // A serviceName matching no category prefix. Must not be bucketed anywhere.
  { villageId: '2', serviceName: 'Mystery', category: null, byStatus: S(99, 0, 0, 0), completedRoundTrips: 0 },
]

describe('CATEGORY_SERIES', () => {
  it('carries the four categories in their fixed order', () => {
    expect(CATEGORY_SERIES.map(s => s.key)).toEqual(['Rides', 'Errands', 'Home Help', 'Tech Support'])
  })

  it('gives every category a light and a dark color', () => {
    for (const s of CATEGORY_SERIES) {
      expect(s.colorLight).toMatch(/^#[0-9a-f]{6}$/i)
      expect(s.colorDark).toMatch(/^#[0-9a-f]{6}$/i)
      expect(s.label).toBe(s.key)
    }
  })
})

describe('byVillageCategory', () => {
  it('returns one row per village with a count per category', () => {
    const rows = byVillageCategory(CELLS, VILLAGES, { legs: false })
    const quahog = rows.find(r => r.villageId === '1')
    expect(quahog).toMatchObject({ villageName: 'Quahog', Rides: 15, Errands: 3 })
  })

  it('zero-fills categories a village has no requests in', () => {
    const rows = byVillageCategory(CELLS, VILLAGES, { legs: false })
    const quahog = rows.find(r => r.villageId === '1')
    expect(quahog['Home Help']).toBe(0)
    expect(quahog['Tech Support']).toBe(0)
  })

  it('seeds a granted village with no cells at all', () => {
    const rows = byVillageCategory(CELLS, VILLAGES, { legs: false })
    const empty = rows.find(r => r.villageId === '3')
    expect(empty.total).toBe(0)
    for (const s of CATEGORY_SERIES) expect(empty[s.key]).toBe(0)
  })

  it('counts only COMPLETED requests — a category bar is work done, not attempted', () => {
    const rows = byVillageCategory(CELLS, VILLAGES, { legs: false })
    const quahog = rows.find(r => r.villageId === '1')
    // Rides completed 10 + 5 = 15; the 1 unmatched and 2 cancelled are excluded.
    expect(quahog.Rides).toBe(15)
  })

  it('applies the legs bump to completed round trips', () => {
    const rows = byVillageCategory(CELLS, VILLAGES, { legs: true })
    const quahog = rows.find(r => r.villageId === '1')
    // 15 completed + 5 round trips
    expect(quahog.Rides).toBe(20)
  })

  it('excludes a cell whose category is null rather than bucketing it', () => {
    const rows = byVillageCategory(CELLS, VILLAGES, { legs: false })
    const innsmouth = rows.find(r => r.villageId === '2')
    expect(innsmouth.total).toBe(7)
    expect(Object.values(innsmouth)).not.toContain(99)
  })

  it('totals the row across categories', () => {
    const rows = byVillageCategory(CELLS, VILLAGES, { legs: false })
    const quahog = rows.find(r => r.villageId === '1')
    expect(quahog.total).toBe(18)
  })
})
