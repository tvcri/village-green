import { describe, it, expect } from 'vitest'
import { roleStatusTag } from './roleStatus.js'

describe('roleStatusTag', () => {
  it.each([
    ['Active', 'success'],
    ['Pending', 'secondary'],
    ['Dropped', 'warn'],
  ])('%s gets severity %s', (status, severity) => {
    expect(roleStatusTag(status, false)).toEqual({ value: status, severity })
  })

  it('deceased wins over any status', () => {
    expect(roleStatusTag('Active', true)).toEqual({ value: 'Deceased', severity: 'contrast' })
    expect(roleStatusTag(null, true)).toEqual({ value: 'Deceased', severity: 'contrast' })
  })

  it('null status gives null', () => {
    expect(roleStatusTag(null, false)).toBeNull()
    expect(roleStatusTag(undefined)).toBeNull()
  })
})
