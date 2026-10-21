import { describe, it, expect } from 'vitest'
import { ACTIVITY_OPTIONS, completedCount, inActivity, isInactive, sortPeople } from './peopleRows.js'

const row = (over) => ({ personId: '1', fullName: 'A', villageId: '1', count: 0, completedRoundTrips: 0, ...over })

describe('completedCount', () => {
  it('counts a completed round-trip ride as two', () => {
    expect(completedCount(row({ count: 5, completedRoundTrips: 2 }))).toBe(7)
  })
})

describe('inActivity', () => {
  it('offers All, 0, 1–9, 10–19, 20–50 and >50, in that order', () => {
    expect(ACTIVITY_OPTIONS.map(o => o.label)).toEqual(['All', '0', '1–9', '10–19', '20–50', '>50'])
  })

  it.each([
    ['all', 0, true], ['all', 99, true],
    ['0', 0, true], ['0', 1, false],
    ['1-9', 1, true], ['1-9', 9, true], ['1-9', 10, false],
    ['10-19', 10, true], ['10-19', 19, true], ['10-19', 20, false],
    ['20-50', 20, true], ['20-50', 50, true], ['20-50', 51, false],
    ['gt50', 50, false], ['gt50', 51, true],
  ])('%s holds %i: %s', (bucket, n, expected) => {
    expect(inActivity(n, bucket)).toBe(expected)
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
