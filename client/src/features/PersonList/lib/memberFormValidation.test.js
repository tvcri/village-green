import { describe, it, expect } from 'vitest'
import { validateMemberForm, dropReasonOptions } from './memberFormValidation.js'

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

describe('drop reason', () => {
  const base = { memberLevel: 'Primary', joinDate: '2024-01-01' }

  it('dropping requires a reason', () => {
    const errors = {}
    const ok = validateMemberForm({ ...base, status: 'Dropped', dropReasonId: null }, errors, { status: 'Active', dropReasonId: null })
    expect(ok).toBe(false)
    expect(errors.dropReasonId).toBe('A drop reason is required')
  })

  it('a new grant set to Dropped requires a reason', () => {
    const errors = {}
    expect(validateMemberForm({ ...base, status: 'Dropped', dropReasonId: null }, errors)).toBe(false)
    expect(errors.dropReasonId).toBe('A drop reason is required')
  })

  it('legacy dropped member saves without choosing a reason', () => {
    const errors = {}
    const ok = validateMemberForm({ ...base, status: 'Dropped', dropReasonId: null }, errors, { status: 'Dropped', dropReasonId: null })
    expect(ok).toBe(true)
    expect(errors.dropReasonId).toBeUndefined()
  })

  it('clearing a loaded reason on a dropped member is rejected', () => {
    const errors = {}
    const ok = validateMemberForm({ ...base, status: 'Dropped', dropReasonId: null }, errors, { status: 'Dropped', dropReasonId: '3' })
    expect(ok).toBe(false)
  })

  it('a non-dropped member needs no reason', () => {
    expect(validateMemberForm({ ...base, status: 'Active', dropReasonId: null }, {}, { status: 'Dropped', dropReasonId: '3' })).toBe(true)
  })
})

describe('dropReasonOptions', () => {
  const reasons = [
    { memberDropReasonId: '1', name: 'Moved', retired: true },
    { memberDropReasonId: '2', name: 'Quit', retired: false },
  ]
  it('retired current reason is offered', () => {
    expect(dropReasonOptions(reasons, '1').map(o => o.label)).toEqual(['Moved (retired)', 'Quit'])
    expect(dropReasonOptions(reasons, '1')[0].value).toBe('1')
  })
  it('retired reasons that are not current are excluded', () => {
    expect(dropReasonOptions(reasons, null).map(o => o.label)).toEqual(['Quit'])
  })
})
