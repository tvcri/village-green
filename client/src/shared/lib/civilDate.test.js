import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatCivilDate, todayCivilDateIn } from './civilDate.js'

describe('formatCivilDate', () => {
  it('formats a civil date without constructing a Date', () => {
    expect(formatCivilDate('2025-04-25')).toBe('Apr 25, 2025')
    expect(formatCivilDate('2026-01-01')).toBe('Jan 1, 2026')
  })
  it('returns an empty string for null', () => {
    expect(formatCivilDate(null)).toBe('')
  })
})

describe('todayCivilDateIn', () => {
  afterEach(() => vi.useRealTimers())
  it('reads the civil date in the named zone, not UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T03:30:00Z'))
    expect(todayCivilDateIn('America/New_York')).toBe('2026-10-31')
    expect(todayCivilDateIn('UTC')).toBe('2026-11-01')
  })
})
