import { describe, expect, it } from 'vitest'
import { isDuplicateUsername, getDeleteConfirmCopy, extractApiErrorMessage, privacyAckStatus } from './userAdminHelpers.js'

describe('isDuplicateUsername', () => {
  it('returns true for a case-insensitive match against existing usernames', () => {
    expect(isDuplicateUsername('Foo@Bar.com', ['foo@bar.com', 'baz@qux.com'])).toBe(true)
  })

  it('returns false when there is no match', () => {
    expect(isDuplicateUsername('new@user.com', ['foo@bar.com'])).toBe(false)
  })

  it('excludes the given username from comparison (editing a row to its own value)', () => {
    expect(isDuplicateUsername('foo@bar.com', ['foo@bar.com', 'baz@qux.com'], 'foo@bar.com')).toBe(false)
  })

  it('still catches a match against a different existing user when excluding self', () => {
    expect(isDuplicateUsername('baz@qux.com', ['foo@bar.com', 'baz@qux.com'], 'foo@bar.com')).toBe(true)
  })
})

describe('getDeleteConfirmCopy', () => {
  it('returns hard-delete wording when lastAccess is falsy', () => {
    const copy = getDeleteConfirmCopy({ username: 'new@user.com', lastAccess: null })
    expect(copy.confirmLabel).toBe('Delete')
    expect(copy.message).toContain('new@user.com')
    expect(copy.message).toContain('never accessed')
  })

  it('returns deactivate wording when lastAccess is truthy', () => {
    const copy = getDeleteConfirmCopy({ username: 'active@user.com', lastAccess: 1700000000 })
    expect(copy.confirmLabel).toBe('Deactivate')
    expect(copy.message).toContain('active@user.com')
    expect(copy.message).toContain('unavailable')
  })
})

describe('extractApiErrorMessage', () => {
  it('returns err.body.detail when present', () => {
    const err = { status: 422, body: { error: 'Unprocessable Entity.', detail: 'Duplicate name exists.' } }
    expect(extractApiErrorMessage(err, 'fallback')).toBe('Duplicate name exists.')
  })

  it('falls back to the provided message when body.detail is missing', () => {
    const err = { status: 500, body: null }
    expect(extractApiErrorMessage(err, 'fallback')).toBe('fallback')
  })

  it('falls back when err itself is missing body entirely', () => {
    expect(extractApiErrorMessage({}, 'fallback')).toBe('fallback')
  })
})

describe('privacyAckStatus', () => {
  const ps = (o) => ({ needsAck: true, pendingRulesId: 2, lastAckedRulesId: null, lastAcknowledgedAt: null, ...o })

  it('is Acknowledged when no ack is needed', () => {
    expect(privacyAckStatus(ps({ needsAck: false, lastAckedRulesId: 2, lastAcknowledgedAt: '2026-05-01T12:00:00Z' }))).toBe('Acknowledged')
  })

  it('is Pending when an older version, or an expired ack, is on record', () => {
    expect(privacyAckStatus(ps({ lastAckedRulesId: 1, lastAcknowledgedAt: '2026-05-01T12:00:00Z' }))).toBe('Pending')
    expect(privacyAckStatus(ps({ lastAckedRulesId: 2, lastAcknowledgedAt: '2025-01-01T12:00:00Z' }))).toBe('Pending')
  })

  it('is Never when the user has no ack on record', () => {
    expect(privacyAckStatus(ps())).toBe('Never')
  })

  it('is null when no rules are published, or the projection is absent', () => {
    expect(privacyAckStatus(ps({ needsAck: false, pendingRulesId: null }))).toBe(null)
    expect(privacyAckStatus(undefined)).toBe(null)
  })
})
