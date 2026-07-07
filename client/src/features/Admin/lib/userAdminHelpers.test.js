import { describe, expect, it } from 'vitest'
import { isDuplicateUsername, getDeleteConfirmCopy, extractApiErrorMessage } from './userAdminHelpers.js'

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
