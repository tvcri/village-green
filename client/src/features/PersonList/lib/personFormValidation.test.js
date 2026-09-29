import { describe, it, expect } from 'vitest'
import { validatePersonForm } from './personFormValidation.js'

const base = () => ({
  firstName: '', lastName: 'Currie', email: '', emergencyContactEmail: '',
  phone: '', cell: '', emergencyContactPhone: '', birthDate: '', zip: '',
})

describe('validatePersonForm', () => {
  it('accepts a blank first name', () => {
    const errors = {}
    expect(validatePersonForm(base(), errors)).toBe(true)
    expect(errors.firstName).toBeUndefined()
  })

  it('accepts a null first name (a loaded NULL-first-name record)', () => {
    const errors = {}
    expect(validatePersonForm({ ...base(), firstName: null }, errors)).toBe(true)
  })

  it('still requires a last name', () => {
    const errors = {}
    expect(validatePersonForm({ ...base(), lastName: '  ' }, errors)).toBe(false)
    expect(errors.lastName).toBe('Last name is required')
  })

  it('rejects a malformed deceased date and accepts a valid one', () => {
    const errors = {}
    expect(validatePersonForm(base(), errors, { deceasedDate: '2026-13-45' })).toBe(false)
    expect(errors.deceasedDate).toBe('Enter a valid date (YYYY-MM-DD)')
    expect(validatePersonForm(base(), {}, { deceasedDate: '2026-02-01' })).toBe(true)
  })

  it('rejects impossible calendar dates that Date.parse rolls over', () => {
    const errors = {}
    expect(validatePersonForm({ ...base(), birthDate: '1950-02-31' }, errors, { deceasedDate: '2026-02-29' })).toBe(false)
    expect(errors.birthDate).toBe('Enter a valid date (YYYY-MM-DD)')
    expect(errors.deceasedDate).toBe('Enter a valid date (YYYY-MM-DD)')
    expect(validatePersonForm({ ...base(), birthDate: '1952-02-29' }, {}, { deceasedDate: '2026-04-30' })).toBe(true)
  })
})
