import { describe, it, expect } from 'vitest'
import { roleStatusTag, flattenRoles } from './roleStatus.js'

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

describe('flattenRoles', () => {
  const member = { memberNumber: '7', status: 'Active', dropReasonName: null, statusChangeNotes: 'm' }
  const volunteer = { capabilities: ['Driving'], status: 'Dropped', dropReasonId: '3', dropReasonName: 'Moved', statusChangeNotes: 'v' }

  it('keeps the member status names and renames the volunteer ones', () => {
    expect(flattenRoles({ personId: '1' }, member, volunteer)).toEqual({
      personId: '1', memberNumber: '7', status: 'Active', dropReasonName: null, statusChangeNotes: 'm',
      capabilities: ['Driving'], volunteerStatus: 'Dropped', volunteerDropReasonId: '3',
      volunteerDropReasonName: 'Moved', volunteerStatusChangeNotes: 'v',
    })
  })

  it('a volunteer alone carries no plain status', () => {
    const flat = flattenRoles({ personId: '1' }, null, volunteer)
    expect(flat.status).toBeUndefined()
    expect(flat.volunteerStatus).toBe('Dropped')
  })
})
