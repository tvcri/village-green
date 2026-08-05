import { describe, it, expect } from 'vitest'
import {
  PRESET_KEYS, PRESET_LABELS, PRESET_LABELS_SHORT,
  presetRange, matchPreset, isValidRange, addDaysCivil
} from './rangePresets.js'

describe('rangePresets', () => {
  it('exposes the four preset keys and labels', () => {
    expect(PRESET_KEYS).toEqual(['thisYear', 'lastYear', 'last90', 'last30'])
    expect(PRESET_LABELS.thisYear).toBe('This year')
  })

  it('offers a short label for every preset', () => {
    // The narrow-viewport labels are a display swap, so the two maps must stay
    // key-for-key identical or a preset renders blank on a phone.
    expect(Object.keys(PRESET_LABELS_SHORT)).toEqual(PRESET_KEYS)
    expect(PRESET_LABELS_SHORT.last30).toBe('30 days')
  })

  it('thisYear = Jan 1 of the year → today', () => {
    expect(presetRange('thisYear', '2026-07-13')).toEqual({ start: '2026-01-01', end: '2026-07-13' })
  })

  it('thisYear on Jan 1 is a single-day range', () => {
    expect(presetRange('thisYear', '2026-01-01')).toEqual({ start: '2026-01-01', end: '2026-01-01' })
  })

  it('lastYear = full previous calendar year', () => {
    expect(presetRange('lastYear', '2026-07-13')).toEqual({ start: '2025-01-01', end: '2025-12-31' })
  })

  it('last30 = today minus 29 days → today (30 inclusive days)', () => {
    expect(presetRange('last30', '2026-07-13')).toEqual({ start: '2026-06-14', end: '2026-07-13' })
  })

  it('last90 = today minus 89 days → today (90 inclusive days)', () => {
    expect(presetRange('last90', '2026-07-13')).toEqual({ start: '2026-04-15', end: '2026-07-13' })
  })

  it('last30 crosses a month/leap boundary correctly', () => {
    // 2024 is a leap year; Mar 1 minus 29 days = Feb 1 2024
    expect(presetRange('last30', '2024-03-01')).toEqual({ start: '2024-02-01', end: '2024-03-01' })
  })

  it('an unknown key returns null', () => {
    expect(presetRange('custom', '2026-07-13')).toBeNull()
    expect(presetRange('nonsense', '2026-07-13')).toBeNull()
  })

  it('matchPreset round-trips each computed preset', () => {
    for (const key of ['thisYear', 'lastYear', 'last90', 'last30']) {
      const r = presetRange(key, '2026-07-13')
      expect(matchPreset(r, '2026-07-13')).toBe(key)
    }
  })

  it('matchPreset returns null for an arbitrary range', () => {
    // null = no preset active, so no button is highlighted.
    expect(matchPreset({ start: '2026-03-02', end: '2026-04-05' }, '2026-07-13')).toBeNull()
  })

  it('isValidRange checks format and ordering', () => {
    expect(isValidRange({ start: '2026-01-01', end: '2026-07-13' })).toBe(true)
    expect(isValidRange({ start: '2026-07-13', end: '2026-01-01' })).toBe(false)
    expect(isValidRange({ start: 'nope', end: '2026-07-13' })).toBe(false)
    expect(isValidRange({ start: '2026-01-01', end: undefined })).toBe(false)
  })

  it('addDaysCivil handles month rollover', () => {
    expect(addDaysCivil('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysCivil('2026-03-01', -1)).toBe('2026-02-28')
  })
})
