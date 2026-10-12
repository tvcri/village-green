import { describe, it, expect } from 'vitest'
import { formatCivilDate } from './civilDate.js'

describe('formatCivilDate', () => {
  it('formats a civil date without constructing a Date', () => {
    expect(formatCivilDate('2025-04-25')).toBe('Apr 25, 2025')
    expect(formatCivilDate('2026-01-01')).toBe('Jan 1, 2026')
  })
  it('returns an empty string for null', () => {
    expect(formatCivilDate(null)).toBe('')
  })
})
