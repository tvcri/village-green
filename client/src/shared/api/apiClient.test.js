import { describe, it, expect } from 'vitest'
import { apiErrorMessage } from './apiClient.js'

describe('apiErrorMessage', () => {
  it('prefers a string detail over the class message', () => {
    expect(apiErrorMessage({ body: { error: 'Conflict.', detail: 'A position named "X" already exists.' } }, 'f'))
      .toBe('A position named "X" already exists.')
  })
  it('falls back to error when detail is not a string (validation errors)', () => {
    expect(apiErrorMessage({ body: { error: 'Bad request', detail: [{ path: '/name' }] } }, 'f')).toBe('Bad request')
  })
  it('falls back to the caller text when there is no body', () => {
    expect(apiErrorMessage(new Error('network'), 'Save failed.')).toBe('Save failed.')
  })
})
