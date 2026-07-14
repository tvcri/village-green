import { describe, it, expect } from 'vitest'
import {
  minutesToTimeString, timeStringToMinutes, timeStringToLabel,
  dateToServiceDate, serviceDateToDate, formatServiceDate
} from './timeFields.js'

describe('minutesToTimeString', () => {
  it('formats minutes-since-midnight', () => {
    expect(minutesToTimeString(0)).toBe('00:00:00')
    expect(minutesToTimeString(540)).toBe('09:00:00')
    expect(minutesToTimeString(23 * 60 + 45)).toBe('23:45:00')
  })
  it('passes null through', () => {
    expect(minutesToTimeString(null)).toBeNull()
    expect(minutesToTimeString(undefined)).toBeNull()
  })
})

describe('timeStringToMinutes', () => {
  it('parses HH:MM:SS ignoring seconds', () => {
    expect(timeStringToMinutes('09:00:00')).toBe(540)
    expect(timeStringToMinutes('23:45:00')).toBe(1425)
    expect(timeStringToMinutes('00:00:00')).toBe(0)
  })
  it('parses HH:MM', () => {
    expect(timeStringToMinutes('13:15')).toBe(795)
  })
  it('passes null/empty through', () => {
    expect(timeStringToMinutes(null)).toBeNull()
    expect(timeStringToMinutes('')).toBeNull()
  })
})

describe('timeStringToLabel', () => {
  it('renders 12-hour labels', () => {
    expect(timeStringToLabel('09:00:00')).toBe('9:00 AM')
    expect(timeStringToLabel('13:15:00')).toBe('1:15 PM')
    expect(timeStringToLabel('00:00:00')).toBe('12:00 AM')
    expect(timeStringToLabel('12:00:00')).toBe('12:00 PM')
  })
  it('passes null through', () => {
    expect(timeStringToLabel(null)).toBeNull()
  })
})

describe('serviceDate round-trip', () => {
  it('formats a local Date to YYYY-MM-DD', () => {
    expect(dateToServiceDate(new Date(2026, 6, 15))).toBe('2026-07-15')
    expect(dateToServiceDate(new Date(2026, 0, 2))).toBe('2026-01-02')
  })
  it('parses YYYY-MM-DD to a LOCAL-midnight Date (not UTC)', () => {
    const d = serviceDateToDate('2026-05-26')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(4)
    expect(d.getDate()).toBe(26)   // would be 25 in EDT if parsed as UTC
    expect(d.getHours()).toBe(0)
  })
  it('round-trips', () => {
    expect(dateToServiceDate(serviceDateToDate('2026-05-26'))).toBe('2026-05-26')
  })
  it('passes null through', () => {
    expect(dateToServiceDate(null)).toBeNull()
    expect(serviceDateToDate(null)).toBeNull()
    expect(serviceDateToDate('')).toBeNull()
  })
})

describe('formatServiceDate', () => {
  it('renders a display date', () => {
    expect(formatServiceDate('2026-07-15')).toBe('Jul 15, 2026')
  })
  it('renders empty for null', () => {
    expect(formatServiceDate(null)).toBe('')
  })
})
