import { describe, it, expect } from 'vitest'
import {
  shownStatus, circleShortName, rowTagKeys, matchesTags, tagLabel, selectionSentence, isEmailPaused
} from './personTags.js'

describe('shownStatus', () => {
  it.each([
    ['Active', false, 'active'],
    ['Pending', false, 'pending'],
    ['Dropped', false, 'dropped'],
    [null, false, null],
    [null, true, null],
    ['Active', true, 'dropped'],
    ['Pending', true, 'dropped'],
    ['Dropped', true, 'dropped']
  ])('(%s, deceased=%s) -> %s', (status, deceased, expected) => {
    expect(shownStatus(status, deceased)).toBe(expected)
  })
})

describe('circleShortName', () => {
  it.each([
    ['Circle of Pride', 'Pride'],
    ["Veteran's Circle", 'Veteran'],
    ['DownCity', 'DownCity'],
    ['OakHill', 'OakHill'],
    ['Circle', 'Circle']
  ])('%s -> %s', (name, expected) => {
    expect(circleShortName(name)).toBe(expected)
  })
})

describe('rowTagKeys', () => {
  it('orders member, volunteer, circles', () => {
    expect(rowTagKeys({ memberStatus: 'Dropped', volunteerStatus: 'Active', deceased: false, circles: [{ circleId: '1' }] }))
      .toEqual(['member:dropped', 'volunteer:active', 'circle:1'])
  })
  it('is empty with no roles or circles', () => {
    expect(rowTagKeys({ memberStatus: null, volunteerStatus: null, deceased: false, circles: [] })).toEqual([])
  })
  it('shows a deceased member as dropped', () => {
    expect(rowTagKeys({ memberStatus: 'Active', volunteerStatus: null, deceased: true, circles: [] })).toEqual(['member:dropped'])
  })
})

describe('matchesTags', () => {
  const keys = ['member:dropped', 'volunteer:active']
  it('matches everything on an empty selection', () => {
    for (const mode of ['any', 'all', 'exact']) {
      expect(matchesTags(keys, [], mode)).toBe(true)
      expect(matchesTags([], [], mode)).toBe(true)
    }
  })
  it('any', () => {
    expect(matchesTags(keys, ['member:dropped'], 'any')).toBe(true)
    expect(matchesTags(keys, ['member:active'], 'any')).toBe(false)
  })
  it('all', () => {
    expect(matchesTags(keys, ['member:dropped', 'volunteer:active'], 'all')).toBe(true)
    expect(matchesTags(keys, ['member:dropped', 'volunteer:pending'], 'all')).toBe(false)
  })
  it('exact is order-insensitive and rejects extra tags', () => {
    expect(matchesTags(keys, ['member:dropped'], 'exact')).toBe(false)
    expect(matchesTags(keys, ['volunteer:active', 'member:dropped'], 'exact')).toBe(true)
    expect(matchesTags(['member:active', 'circle:1'], ['member:active'], 'exact')).toBe(false)
  })
  it('a row with no tags matches no non-empty selection', () => {
    for (const mode of ['any', 'all', 'exact']) expect(matchesTags([], ['member:active'], mode)).toBe(false)
  })
})

describe('tagLabel', () => {
  const names = new Map([['1', 'Circle of Pride']])
  it('labels roles and circles', () => {
    expect(tagLabel('member:pending', names)).toBe('Member, pending')
    expect(tagLabel('volunteer:active', names)).toBe('Volunteer, active')
    expect(tagLabel('circle:1', names)).toBe('Circle of Pride')
  })
})

describe('selectionSentence', () => {
  const names = new Map([['1', 'Circle of Pride']])
  it('is empty for no selection', () => {
    expect(selectionSentence([], 'any', names)).toBe('')
  })
  it('joins two with or / and', () => {
    expect(selectionSentence(['member:pending', 'volunteer:pending'], 'any', names))
      .toBe('People who are a pending member or a pending volunteer')
    expect(selectionSentence(['member:pending', 'volunteer:pending'], 'all', names))
      .toBe('People who are a pending member and a pending volunteer')
  })
  it('phrases circles', () => {
    expect(selectionSentence(['member:active', 'circle:1'], 'any', names))
      .toBe('People who are an active member or in Circle of Pride')
  })
  it('exact uses bare labels', () => {
    expect(selectionSentence(['member:active'], 'exact', names))
      .toBe('People whose tags are exactly: active member')
  })
  it('joins three with commas and a final or', () => {
    expect(selectionSentence(['member:active', 'volunteer:pending', 'circle:1'], 'any', names))
      .toBe('People who are an active member, a pending volunteer or in Circle of Pride')
  })
})

describe('isEmailPaused', () => {
  const today = '2026-10-29'
  const base = { volunteerStatus: 'Active', deceased: false }
  it('is true for an in-effect or scheduled pause', () => {
    expect(isEmailPaused({ ...base, volunteerPause: { scope: 'all', startDate: null, endDate: null } }, today)).toBe(true)
    expect(isEmailPaused({ ...base, volunteerPause: { scope: 'window', startDate: '2026-11-01', endDate: '2026-11-10' } }, today)).toBe(true)
  })
  it('is false for expired, absent, deceased, or dropped', () => {
    expect(isEmailPaused({ ...base, volunteerPause: { startDate: null, endDate: '2026-10-01', scope: 'all' } }, today)).toBe(false)
    expect(isEmailPaused({ ...base, volunteerPause: null }, today)).toBe(false)
    expect(isEmailPaused({ ...base, deceased: true, volunteerPause: { scope: 'all', startDate: null, endDate: null } }, today)).toBe(false)
    expect(isEmailPaused({ ...base, volunteerStatus: 'Dropped', volunteerPause: { scope: 'all', startDate: null, endDate: null } }, today)).toBe(false)
  })
})
