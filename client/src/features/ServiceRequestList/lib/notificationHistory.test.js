import { describe, it, expect } from 'vitest'
import {
  eventStatus,
  eventStatusSeverity,
  formatEventDate,
  outcomeLabel,
  eventTypeLabel,
  recipientList,
  sortHistory,
} from './notificationHistory.js'

describe('eventStatus', () => {
  it('returns sent when sentAt is set', () => {
    expect(eventStatus({ sentAt: '2026-06-26T14:00:05Z', failedAt: null })).toBe('sent')
  })
  it('returns failed when failedAt is set', () => {
    expect(eventStatus({ sentAt: null, failedAt: '2026-06-26T14:00:05Z' })).toBe('failed')
  })
  it('returns pending when neither is set', () => {
    expect(eventStatus({ sentAt: null, failedAt: null })).toBe('pending')
  })
  it('returns pending when both keys absent', () => {
    expect(eventStatus({})).toBe('pending')
  })
})

describe('eventStatusSeverity', () => {
  it('maps sent to success', () => expect(eventStatusSeverity('sent')).toBe('success'))
  it('maps failed to danger', () => expect(eventStatusSeverity('failed')).toBe('danger'))
  it('maps pending to secondary', () => expect(eventStatusSeverity('pending')).toBe('secondary'))
})

describe('formatEventDate', () => {
  it('returns empty string for falsy input', () => {
    expect(formatEventDate(null)).toBe('')
    expect(formatEventDate(undefined)).toBe('')
    expect(formatEventDate('')).toBe('')
  })
  it('formats a date string to a non-empty localized string', () => {
    const out = formatEventDate('2026-06-26T14:00:00Z')
    expect(typeof out).toBe('string')
    expect(out.length).toBeGreaterThan(0)
  })
})

describe('outcomeLabel', () => {
  it('prefixes Sent for a sent event', () => {
    expect(outcomeLabel({ sentAt: '2026-06-26T14:00:05Z' })).toMatch(/^Sent /)
  })
  it('prefixes Failed for a failed event', () => {
    expect(outcomeLabel({ failedAt: '2026-06-26T14:00:05Z' })).toMatch(/^Failed /)
  })
  it('prefixes Created for a pending event using createdAt', () => {
    expect(outcomeLabel({ createdAt: '2026-06-26T14:00:00Z' })).toMatch(/^Created /)
  })
})

describe('eventTypeLabel', () => {
  it('capitalizes the first letter', () => {
    expect(eventTypeLabel('open')).toBe('Open')
    expect(eventTypeLabel('confirmed')).toBe('Confirmed')
  })
  it('returns empty string for falsy input', () => {
    expect(eventTypeLabel('')).toBe('')
    expect(eventTypeLabel(null)).toBe('')
  })
})

describe('recipientList', () => {
  it('returns an array of fullNames (broadcast case)', () => {
    const entry = { recipients: [{ fullName: 'Doe, Jane' }, { fullName: 'Smith, John' }] }
    expect(recipientList(entry)).toEqual(['Doe, Jane', 'Smith, John'])
  })
  it('returns a single-element array for one recipient', () => {
    expect(recipientList({ recipients: [{ fullName: 'Doe, Jane' }] })).toEqual(['Doe, Jane'])
  })
  it('filters out entries without a fullName', () => {
    const entry = { recipients: [{ fullName: 'Doe, Jane' }, { fullName: null }, {}] }
    expect(recipientList(entry)).toEqual(['Doe, Jane'])
  })
  it('returns an empty array when recipients is empty', () => {
    expect(recipientList({ recipients: [] })).toEqual([])
  })
  it('returns an empty array when recipients is absent', () => {
    expect(recipientList({})).toEqual([])
  })
})

describe('sortHistory', () => {
  it('sorts by createdAt descending (newest first)', () => {
    const history = [
      { id: 1, createdAt: '2026-06-26T10:00:00Z' },
      { id: 2, createdAt: '2026-06-26T14:00:00Z' },
      { id: 3, createdAt: '2026-06-26T12:00:00Z' },
    ]
    expect(sortHistory(history).map(e => e.id)).toEqual([2, 3, 1])
  })
  it('does not mutate the input array', () => {
    const history = [
      { id: 1, createdAt: '2026-06-26T10:00:00Z' },
      { id: 2, createdAt: '2026-06-26T14:00:00Z' },
    ]
    const before = history.map(e => e.id)
    sortHistory(history)
    expect(history.map(e => e.id)).toEqual(before)
  })
  it('returns an empty array for non-array input', () => {
    expect(sortHistory(null)).toEqual([])
    expect(sortHistory(undefined)).toEqual([])
  })
})
