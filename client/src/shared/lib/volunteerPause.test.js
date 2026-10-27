import { describe, it, expect } from 'vitest'
import { pauseCovers, pauseState, pauseTag, pauseSentence, formatPauseDate } from './volunteerPause.js'

const TODAY = '2026-11-20'
const p = (startDate, endDate, scope = 'all') => ({ startDate, endDate, scope })

describe('pauseCovers', () => {
  it('is inclusive on both ends and open when a bound is null', () => {
    expect(pauseCovers(p('2026-03-01', '2026-03-15'), '2026-03-01')).toBe(true)
    expect(pauseCovers(p('2026-03-01', '2026-03-15'), '2026-03-15')).toBe(true)
    expect(pauseCovers(p('2026-03-01', '2026-03-15'), '2026-03-16')).toBe(false)
    expect(pauseCovers(p(null, null), '2026-03-16')).toBe(true)
    expect(pauseCovers(null, '2026-03-16')).toBe(false)
  })
})

describe('pauseState', () => {
  it('names the four states', () => {
    expect(pauseState(null, TODAY)).toBe('none')
    expect(pauseState(p('2026-11-21', null), TODAY)).toBe('scheduled')
    expect(pauseState(p(null, TODAY), TODAY)).toBe('active')
    expect(pauseState(p(null, null), TODAY)).toBe('active')
    expect(pauseState(p(null, '2026-11-19'), TODAY)).toBe('expired')
  })
})

describe('formatPauseDate', () => {
  it('drops the year only in the current year', () => {
    expect(formatPauseDate('2026-03-01', TODAY)).toBe('Mar 1')
    expect(formatPauseDate('2027-03-01', TODAY)).toBe('Mar 1, 2027')
  })
})

describe('pauseTag', () => {
  it('reads each wording', () => {
    expect(pauseTag(p(null, null), TODAY)).toBe('Paused')
    expect(pauseTag(p('2026-11-01', null), TODAY)).toBe('Paused')
    expect(pauseTag(p(null, '2026-12-15'), TODAY)).toBe('Paused until Dec 15')
    expect(pauseTag(p('2026-11-01', '2026-12-15'), TODAY)).toBe('Paused until Dec 15')
    expect(pauseTag(p('2026-12-01', null), TODAY)).toBe('Paused from Dec 1')
    expect(pauseTag(p('2026-12-01', '2026-12-15'), TODAY)).toBe('Paused Dec 1–15')
    expect(pauseTag(p('2026-11-25', '2026-12-03', 'window'), TODAY)).toBe('Paused Nov 25 – Dec 3')
    expect(pauseTag(p('2026-11-01', '2026-12-15', 'window'), TODAY)).toBe('Paused Nov 1 – Dec 15')
    expect(pauseTag(null, TODAY)).toBeNull()
  })
  it('pauseTag returns null after the end date', () => {
    expect(pauseTag(p(null, '2026-11-19'), TODAY)).toBeNull()
    expect(pauseTag(p('2026-11-01', '2026-11-19', 'window'), TODAY)).toBeNull()
  })
  it('a same-month range in another year keeps the year', () => {
    expect(pauseTag(p('2027-03-01', '2027-03-15', 'window'), TODAY)).toBe('Paused Mar 1–15, 2027')
  })
  it('a range into next year shows the year', () => {
    expect(pauseTag(p('2026-12-01', '2027-02-01', 'window'), TODAY)).toBe('Paused Dec 1 – Feb 1, 2027')
  })
})

describe('pauseSentence', () => {
  it('matches the API wording', () => {
    expect(pauseSentence('Pat Example', p('2026-03-01', '2026-03-15'), TODAY)).toBe('Pat Example is paused Mar 1 – Mar 15.')
    expect(pauseSentence('Pat Example', p('2026-03-01', null), TODAY)).toBe('Pat Example is paused from Mar 1.')
    expect(pauseSentence('Pat Example', p(null, '2027-03-15'), TODAY)).toBe('Pat Example is paused until Mar 15, 2027.')
    expect(pauseSentence('Pat Example', p(null, null), TODAY)).toBe('Pat Example is paused.')
  })
})
