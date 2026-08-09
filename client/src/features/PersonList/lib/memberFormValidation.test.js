import { describe, it, expect } from 'vitest'
import { validateMemberForm } from './memberFormValidation.js'

function form (overrides = {}) {
  return { memberLevel: 'Primary', joinDate: '2026-08-09', primaryPersonId: '', ...overrides }
}

describe('validateMemberForm', () => {
  it('accepts a complete Primary member', () => {
    const errors = {}
    expect(validateMemberForm(form(), errors)).toBe(true)
    expect(errors).toEqual({})
  })

  it('requires memberLevel', () => {
    const errors = {}
    expect(validateMemberForm(form({ memberLevel: '' }), errors)).toBe(false)
    expect(errors.memberLevel).toBe('Member level is required')
  })

  it('requires joinDate', () => {
    const errors = {}
    expect(validateMemberForm(form({ joinDate: '' }), errors)).toBe(false)
    expect(errors.joinDate).toBe('Join date is required')
  })

  it('rejects a malformed joinDate', () => {
    const errors = {}
    expect(validateMemberForm(form({ joinDate: '08/09/2026' }), errors)).toBe(false)
    expect(errors.joinDate).toBe('Enter a valid date (YYYY-MM-DD)')
  })

  it('rejects a well-formed but impossible joinDate', () => {
    const errors = {}
    expect(validateMemberForm(form({ joinDate: '2026-02-31' }), errors)).toBe(false)
    expect(errors.joinDate).toBe('Enter a valid date (YYYY-MM-DD)')
  })

  it('requires a primary person for a Secondary member', () => {
    const errors = {}
    expect(validateMemberForm(form({ memberLevel: 'Secondary' }), errors)).toBe(false)
    expect(errors.primaryPersonId).toBe('A Secondary member needs a primary person')
  })

  it('accepts a Secondary member that has a primary person', () => {
    const errors = {}
    expect(validateMemberForm(form({ memberLevel: 'Secondary', primaryPersonId: 42 }), errors)).toBe(true)
  })

  it('clears stale errors from a previous run', () => {
    const errors = { memberLevel: 'Member level is required' }
    expect(validateMemberForm(form(), errors)).toBe(true)
    expect(errors).toEqual({})
  })
})
