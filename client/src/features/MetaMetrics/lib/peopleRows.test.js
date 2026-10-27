import { describe, it, expect } from 'vitest'
import { ACTIVITY_OPTIONS, completedCount, inActivity, isInactive, sortPeople, peopleCsvColumns, peopleCsvRows, peopleCsvFilename } from './peopleRows.js'

const row = (over) => ({ personId: '1', fullName: 'A', villageId: '1', count: 0, completedRoundTrips: 0, ...over })

describe('completedCount', () => {
  it('counts a completed round-trip ride as two', () => {
    expect(completedCount(row({ count: 5, completedRoundTrips: 2 }))).toBe(7)
  })
})

describe('inActivity', () => {
  it('offers All, 0, 1–49 and 50+, in that order', () => {
    expect(ACTIVITY_OPTIONS.map(o => o.label)).toEqual(['All', '0', '1–49', '50+'])
  })

  it.each([
    ['all', 0, true], ['all', 99, true],
    ['0', 0, true], ['0', 1, false],
    ['1-49', 0, false], ['1-49', 1, true], ['1-49', 49, true], ['1-49', 50, false],
    ['50plus', 49, false], ['50plus', 50, true], ['50plus', 51, true],
  ])('%s holds %i: %s', (bucket, n, expected) => {
    expect(inActivity(n, bucket)).toBe(expected)
  })

  it('leaves no count outside every bucket', () => {
    const buckets = ACTIVITY_OPTIONS.filter(o => o.value !== 'all').map(o => o.value)
    for (let n = 0; n <= 200; n++) {
      expect(buckets.filter(b => inActivity(n, b))).toHaveLength(1)
    }
  })
})

describe('isInactive', () => {
  it('reads a member from status', () => {
    expect(isInactive(row({ status: 'Active' }))).toBe(false)
    expect(isInactive(row({ status: 'Dropped' }))).toBe(true)
  })

  it('reads a volunteer from active', () => {
    expect(isInactive(row({ active: true }))).toBe(false)
    expect(isInactive(row({ active: false }))).toBe(true)
  })
})

describe('sortPeople', () => {
  const names = new Map([['1', 'Warwick'], ['2', 'Barrington']])
  const rows = [
    row({ personId: 'a', fullName: 'Brown, Ann', villageId: '1', count: 3 }),
    row({ personId: 'b', fullName: 'Adams, Bea', villageId: '2', count: 3 }),
    row({ personId: 'c', fullName: 'Cole, Cy', villageId: '2', count: 10 }),
  ]
  const ids = (out) => out.map(r => r.personId)

  it('sorts by completed count, ties broken by name', () => {
    expect(ids(sortPeople(rows, 'count', 'desc', names))).toEqual(['c', 'b', 'a'])
    expect(ids(sortPeople(rows, 'count', 'asc', names))).toEqual(['b', 'a', 'c'])
  })

  it('sorts by name', () => {
    expect(ids(sortPeople(rows, 'fullName', 'asc', names))).toEqual(['b', 'a', 'c'])
  })

  it('sorts by village name, not id', () => {
    expect(ids(sortPeople(rows, 'village', 'asc', names))).toEqual(['b', 'c', 'a'])
  })

  it('does not mutate its input', () => {
    const before = ids(rows)
    sortPeople(rows, 'count', 'desc', names)
    expect(ids(rows)).toEqual(before)
  })
})

describe('people CSV', () => {
  const names = new Map([['1', 'Warwick']])

  it('carries name, village, status and the doubled completed count', () => {
    const rows = peopleCsvRows([
      row({ fullName: 'Brown, Ann', villageId: '1', status: 'Dropped', count: 3, completedRoundTrips: 1 }),
      row({ fullName: 'Cole, Cy', villageId: '1', active: true, count: 0 }),
    ], names)
    expect(peopleCsvColumns('Member').map(c => c.header)).toEqual(['Member', 'Village', 'Status', 'Completed'])
    expect(rows).toEqual([
      { fullName: 'Brown, Ann', village: 'Warwick', status: 'Dropped', completed: 4 },
      { fullName: 'Cole, Cy', village: 'Warwick', status: 'Active', completed: 0 },
    ])
  })

  it('names an inactive volunteer Inactive', () => {
    expect(peopleCsvRows([row({ active: false })], names)[0].status).toBe('Inactive')
  })

  it('puts the village, list, bucket and range in the filename', () => {
    expect(peopleCsvFilename({ villageName: 'Bristol-Warren', list: 'members', activity: '0', start: '2026-01-01', end: '2026-10-21' }))
      .toBe('tvcri-people-bristol-warren-members-0-2026-01-01-2026-10-21.csv')
  })

  it('leaves the bucket out when every count is shown', () => {
    expect(peopleCsvFilename({ villageName: 'All villages', list: 'volunteers', activity: 'all', start: '2026-01-01', end: '2026-10-21' }))
      .toBe('tvcri-people-all-villages-volunteers-2026-01-01-2026-10-21.csv')
  })
})

describe('deceased rows', () => {
  it('are labelled Deceased and counted as not active', () => {
    const m = row({ status: 'Active', deceased: true })
    const v = row({ active: true, deceased: true })
    expect(isInactive(m)).toBe(true)
    expect(isInactive(v)).toBe(true)
    expect(peopleCsvRows([m, v], new Map()).map(r => r.status)).toEqual(['Deceased', 'Deceased'])
  })
})
