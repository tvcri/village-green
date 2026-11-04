import { describe, it, expect } from 'vitest'
import { validateVolunteerForm } from './volunteerFormValidation.js'

describe('validateVolunteerForm', () => {
  it('accepts an Active volunteer', () => {
    const errors = {}
    expect(validateVolunteerForm({ status: 'Active', dropReasonId: null }, errors)).toBe(true)
    expect(errors).toEqual({})
  })

  it('requires a drop reason when dropping a new volunteer', () => {
    const errors = {}
    expect(validateVolunteerForm({ status: 'Dropped', dropReasonId: null }, errors)).toBe(false)
    expect(errors.dropReasonId).toBe('A drop reason is required')
  })

  it('requires a drop reason when an Active volunteer is being dropped', () => {
    const errors = {}
    const loaded = { status: 'Active', dropReasonId: null }
    expect(validateVolunteerForm({ status: 'Dropped', dropReasonId: null }, errors, loaded)).toBe(false)
    expect(errors.dropReasonId).toBe('A drop reason is required')
  })

  it('lets a loaded Dropped volunteer with no reason save unchanged', () => {
    const errors = {}
    const loaded = { status: 'Dropped', dropReasonId: null }
    expect(validateVolunteerForm({ status: 'Dropped', dropReasonId: null }, errors, loaded)).toBe(true)
  })

  it('accepts a chosen reason, and clears stale errors', () => {
    const errors = { dropReasonId: 'old' }
    expect(validateVolunteerForm({ status: 'Dropped', dropReasonId: '2' }, errors)).toBe(true)
    expect(errors).toEqual({})
  })
})
