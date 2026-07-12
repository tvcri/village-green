import { describe, expect, it } from 'vitest'
import { HUB_SCOPE, availableRoles, scopeOptions, toGrantRows } from './grantDisplayHelpers.js'

const village = (grantId, roleId, villageId, name) => ({ grantId, roleId, village: { villageId, name } })
const hub = (grantId, roleId) => ({ grantId, roleId, village: null })

describe('toGrantRows', () => {
  it('maps hub and village grants to unified rows', () => {
    const rows = toGrantRows([hub('10', 5), village('11', 3, '2', 'Oak')], (id) => `Role ${id}`)
    expect(rows).toEqual([
      { grantId: '10', villageId: null, scopeLabel: 'Hub', isHub: true, roleId: 5, roleLabel: 'Role 5' },
      { grantId: '11', villageId: '2', scopeLabel: 'Oak', isHub: false, roleId: 3, roleLabel: 'Role 3' },
    ])
  })
  it('handles null input', () => {
    expect(toGrantRows(null, (id) => `${id}`)).toEqual([])
  })
})

describe('scopeOptions', () => {
  it('offers Hub first, then every village — none excluded', () => {
    expect(scopeOptions([{ villageId: '2', name: 'Oak' }])).toEqual([
      { label: 'Hub', value: HUB_SCOPE },
      { label: 'Oak', value: '2' },
    ])
    expect(scopeOptions(null)).toEqual([{ label: 'Hub', value: HUB_SCOPE }])
  })
})

describe('availableRoles', () => {
  const federationRoles = [{ roleId: 4, name: 'Admin' }, { roleId: 5, name: 'Staff' }]
  const villageRoles = [{ roleId: 1, name: 'LSC' }, { roleId: 3, name: 'Village Lead' }]
  const rows = toGrantRows([hub('10', 5), village('11', 3, '2', 'Oak')], (id) => `${id}`)

  it('returns [] before a scope is chosen', () => {
    expect(availableRoles({ scopeValue: null, federationRoles, villageRoles, rows })).toEqual([])
  })
  it('hub scope offers federation roles minus held', () => {
    expect(availableRoles({ scopeValue: HUB_SCOPE, federationRoles, villageRoles, rows }))
      .toEqual([{ roleId: 4, name: 'Admin' }])
  })
  it('village scope offers village roles minus held in THAT village, tolerating id type mismatch', () => {
    expect(availableRoles({ scopeValue: 2, federationRoles, villageRoles, rows }))
      .toEqual([{ roleId: 1, name: 'LSC' }])
    expect(availableRoles({ scopeValue: '9', federationRoles, villageRoles, rows }))
      .toEqual(villageRoles)
  })
})
