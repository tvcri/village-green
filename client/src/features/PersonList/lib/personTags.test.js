import { describe, it, expect } from 'vitest'
import {
  shownStatus, circleShortName, rowTagKeys, matchesTags, tagLabel, selectionSentence, isEmailPaused, DONOR_WINDOWS
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

describe('rowTagKeys donor', () => {
  it('emits donor after volunteer and before circles', () => {
    expect(rowTagKeys({ memberStatus: 'Active', donor: { lastGiftDate: '2025-01-01' }, circles: [{ circleId: 1 }] }))
      .toEqual(['member:active', 'donor', 'circle:1'])
  })
  it('emits nothing without a donor', () => {
    expect(rowTagKeys({ memberStatus: 'Active', donor: null })).toEqual(['member:active'])
  })
})

describe('DONOR_WINDOWS', () => {
  it('lists the four window keys', () => {
    expect(DONOR_WINDOWS.map(w => w.key)).toEqual(['donor:1y', 'donor:2y', 'donor:5y', 'donor:any'])
  })
})

describe('matchesTags donor windows', () => {
  const today = '2026-11-09'
  const keys = ['member:active', 'donor']
  const ctx = { lastGiftDate: '2018-01-01', today }
  it('any', () => {
    expect(matchesTags(keys, ['donor:5y', 'member:active'], 'any', ctx)).toBe(true)
  })
  it('all', () => {
    expect(matchesTags(keys, ['donor:5y', 'member:active'], 'all', ctx)).toBe(false)
  })
  it('exact', () => {
    expect(matchesTags(keys, ['member:active', 'donor:any'], 'exact', ctx)).toBe(true)
    expect(matchesTags(keys, ['member:active', 'donor:5y'], 'exact', ctx)).toBe(false)
    expect(matchesTags(keys, ['member:active'], 'exact', ctx)).toBe(false)
  })
  it('matches a gift inside the window, inclusive of the cutoff', () => {
    expect(matchesTags(['donor'], ['donor:5y'], 'any', { lastGiftDate: '2021-11-09', today })).toBe(true)
    expect(matchesTags(['donor'], ['donor:5y'], 'any', { lastGiftDate: '2021-11-08', today })).toBe(false)
  })
  it('a null gift is excluded by a year window and included by any time', () => {
    const c = { lastGiftDate: null, today }
    expect(matchesTags(['donor'], ['donor:1y'], 'any', c)).toBe(false)
    expect(matchesTags(['donor'], ['donor:any'], 'any', c)).toBe(true)
  })
  it('a non-donor row never matches a window', () => {
    expect(matchesTags(['member:active'], ['donor:any'], 'any', ctx)).toBe(false)
  })
  it('leap-day cutoff clamps to Feb 28', () => {
    const c = { lastGiftDate: '2027-02-28', today: '2028-02-29' }
    expect(matchesTags(['donor'], ['donor:1y'], 'any', c)).toBe(true)
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
    expect(tagLabel('donor')).toBe('Donor')
  })
})

describe('selectionSentence', () => {
  const names = new Map([['1', 'Circle of Pride']])
  it('is empty for no selection', () => {
    expect(selectionSentence([], 'any', names)).toBe('')
  })
  it('joins two with or / and', () => {
    expect(selectionSentence(['member:pending', 'volunteer:pending'], 'any', names))
      .toBe('People who are a pending member OR a pending volunteer')
    expect(selectionSentence(['member:pending', 'volunteer:pending'], 'all', names))
      .toBe('People who are a pending member AND a pending volunteer')
  })
  it('phrases circles', () => {
    expect(selectionSentence(['member:active', 'circle:1'], 'any', names))
      .toBe('People who are an active member OR in Circle of Pride')
  })
  it('exact uses bare labels', () => {
    expect(selectionSentence(['member:active'], 'exact', names))
      .toBe('People whose tags are EXACTLY: active member')
  })
  it('phrases donor windows', () => {
    expect(selectionSentence(['donor:5y', 'member:active'], 'any', names))
      .toBe('People who are a donor (last gift within 5 years) OR an active member')
    expect(selectionSentence(['donor:1y'], 'any', names)).toBe('People who are a donor (last gift within 1 year)')
    expect(selectionSentence(['donor:any'], 'any', names)).toBe('People who are a donor')
  })
  it('adds the Also boxes after a comma, in every mode', () => {
    expect(selectionSentence(['member:dropped', 'donor:1y'], 'all', names, ['are veterans']))
      .toBe('People who are a dropped member AND a donor (last gift within 1 year), and who are veterans')
    expect(selectionSentence(['member:active'], 'any', names, ['have email paused', 'are veterans', 'are deceased']))
      .toBe('People who are an active member, and who have email paused, are veterans and are deceased')
    expect(selectionSentence(['member:active'], 'exact', names, ['are deceased']))
      .toBe('People whose tags are EXACTLY: active member, and who are deceased')
  })
  it('speaks for the Also boxes alone when no tag is picked', () => {
    expect(selectionSentence([], 'any', names, ['are veterans'])).toBe('People who are veterans')
    expect(selectionSentence([], 'any', names, [])).toBe('')
  })
  it('exact uses bare donor labels', () => {
    expect(selectionSentence(['donor:2y'], 'exact', names))
      .toBe('People whose tags are EXACTLY: donor (last gift within 2 years)')
  })
  it('joins three with commas and a final or', () => {
    expect(selectionSentence(['member:active', 'volunteer:pending', 'circle:1'], 'any', names))
      .toBe('People who are an active member, a pending volunteer OR in Circle of Pride')
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
