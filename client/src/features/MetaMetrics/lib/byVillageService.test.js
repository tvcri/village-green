import { describe, it, expect } from 'vitest'
import { byVillageService, drilldownCategories, serviceSeries } from './byVillageService.js'

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
  { villageId: '1', serviceName: 'Errand: Other', category: 'Errands', byStatus: S(3, 0, 0, 0), completedRoundTrips: 0 },
  { villageId: '2', serviceName: 'Ride: Medical Appnt', category: 'Rides', byStatus: S(7, 0, 0, 0), completedRoundTrips: 0 },
  { villageId: '2', serviceName: 'Tech Support', category: 'Tech Support', byStatus: S(9, 0, 0, 0), completedRoundTrips: 0 },
  { villageId: '2', serviceName: 'Mystery', category: null, byStatus: S(99, 0, 0, 0), completedRoundTrips: 0 },
]

describe('drilldownCategories', () => {
  it('offers only categories that actually have more than one service', () => {
    // Rides has two service names here; Errands and Tech Support have one each,
    // so drilling into them would show a single column identical to the total.
    expect(drilldownCategories(CELLS)).toEqual(['Rides'])
  })

  it('grows automatically as the vocabulary does', () => {
    const withFriends = [
      ...CELLS,
      { villageId: '1', serviceName: 'Friends: Visit', category: 'Friends', byStatus: S(4, 0, 0, 0), completedRoundTrips: 0 },
      { villageId: '1', serviceName: 'Friends: Call', category: 'Friends', byStatus: S(6, 0, 0, 0), completedRoundTrips: 0 },
    ]
    expect(drilldownCategories(withFriends)).toEqual(['Friends', 'Rides'])
  })

  it('returns nothing when no category has a second service', () => {
    expect(drilldownCategories([CELLS[2], CELLS[4]])).toEqual([])
  })

  it('ignores cells whose category is null', () => {
    expect(drilldownCategories([CELLS[5]])).toEqual([])
  })
})

describe('serviceSeries', () => {
  it('lists the services of the chosen category, busiest first', () => {
    expect(serviceSeries(CELLS, 'Rides').map(s => s.key))
      .toEqual(['Ride: Medical Appnt', 'Ride: Shopping'])
  })

  it('strips the category prefix from the label, since the tab names it', () => {
    expect(serviceSeries(CELLS, 'Rides').map(s => s.label))
      .toEqual(['Medical Appnt', 'Shopping'])
  })

  it('gives every service both theme colors', () => {
    for (const s of serviceSeries(CELLS, 'Rides')) {
      expect(s.colorLight).toMatch(/^#[0-9a-f]{6}$/i)
      expect(s.colorDark).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('returns an empty series for a category with no cells', () => {
    expect(serviceSeries(CELLS, 'Nonexistent')).toEqual([])
  })
})

describe('byVillageService', () => {
  it('returns one row per village with a count per service', () => {
    const rows = byVillageService(CELLS, VILLAGES, 'Rides', { legs: false })
    const quahog = rows.find(r => r.villageId === '1')
    expect(quahog['Ride: Medical Appnt']).toBe(10)
    expect(quahog['Ride: Shopping']).toBe(5)
  })

  it('excludes services outside the chosen category', () => {
    const rows = byVillageService(CELLS, VILLAGES, 'Rides', { legs: false })
    const quahog = rows.find(r => r.villageId === '1')
    expect(quahog['Errand: Other']).toBeUndefined()
    expect(quahog.total).toBe(15)
  })

  it('counts completed work only, matching the Categories tab', () => {
    const rows = byVillageService(CELLS, VILLAGES, 'Rides', { legs: false })
    // Quahog's medical rides: 10 completed; its 1 unmatched and 2 cancelled
    // are not work done.
    expect(rows.find(r => r.villageId === '1')['Ride: Medical Appnt']).toBe(10)
  })

  it('applies the legs bump', () => {
    const rows = byVillageService(CELLS, VILLAGES, 'Rides', { legs: true })
    const quahog = rows.find(r => r.villageId === '1')
    expect(quahog['Ride: Medical Appnt']).toBe(14)
    expect(quahog.total).toBe(20)
  })

  it('seeds a granted village with no requests at all', () => {
    const rows = byVillageService(CELLS, VILLAGES, 'Rides', { legs: false })
    const empty = rows.find(r => r.villageId === '3')
    expect(empty.total).toBe(0)
    expect(empty['Ride: Medical Appnt']).toBe(0)
  })

  it('zero-fills a service a village has never provided', () => {
    const rows = byVillageService(CELLS, VILLAGES, 'Rides', { legs: false })
    // Innsmouth has medical rides but no shopping rides.
    expect(rows.find(r => r.villageId === '2')['Ride: Shopping']).toBe(0)
  })
})
