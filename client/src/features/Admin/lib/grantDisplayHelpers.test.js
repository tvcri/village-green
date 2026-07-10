import { describe, expect, it } from 'vitest'
import { splitGrants, toVillageGrantRows, hubSelectionState, computeHubRoleOps } from './grantDisplayHelpers.js'

const village = (grantId, roleId, villageId, name) => ({ grantId, roleId, village: { villageId, name } })
const hub = (grantId, roleId) => ({ grantId, roleId, village: null })

describe('splitGrants', () => {
  it('separates hub (village: null) from village grants', () => {
    const { hubGrants, villageGrants } = splitGrants([hub('10', 5), village('11', 3, '2', 'Oak')])
    expect(hubGrants).toEqual([hub('10', 5)])
    expect(villageGrants).toEqual([village('11', 3, '2', 'Oak')])
  })
  it('handles null/undefined input', () => {
    expect(splitGrants(null)).toEqual({ hubGrants: [], villageGrants: [] })
  })
})

describe('toVillageGrantRows', () => {
  it('flattens village grants into display rows', () => {
    const rows = toVillageGrantRows([village('11', 3, '2', 'Oak')], (id) => `Role ${id}`)
    expect(rows).toEqual([{ grantId: '11', villageId: '2', villageName: 'Oak', roleId: 3, roleLabel: 'Role 3' }])
  })
})

describe('hubSelectionState', () => {
  it('returns null roleId when no hub grants', () => {
    expect(hubSelectionState([])).toEqual({ roleId: null, isMultiple: false })
  })
  it('returns the stringified roleId for a single hub grant', () => {
    expect(hubSelectionState([hub('10', 5)])).toEqual({ roleId: '5', isMultiple: false })
  })
  it('flags multiple hub grants', () => {
    expect(hubSelectionState([hub('10', 5), hub('12', 4)])).toEqual({ roleId: null, isMultiple: true })
  })
})

describe('computeHubRoleOps', () => {
  it('creates when the user holds no hub role', () => {
    expect(computeHubRoleOps([], '5')).toEqual({ createRoleId: '5', deleteGrantIds: [] })
  })
  it('replaces a different role: create new, delete old', () => {
    expect(computeHubRoleOps([hub('10', 6)], '5')).toEqual({ createRoleId: '5', deleteGrantIds: ['10'] })
  })
  it('is a no-op when re-selecting the held role', () => {
    expect(computeHubRoleOps([hub('10', 5)], '5')).toEqual({ createRoleId: null, deleteGrantIds: [] })
  })
  it('None deletes all hub grants and creates nothing', () => {
    expect(computeHubRoleOps([hub('10', 5), hub('12', 4)], null))
      .toEqual({ createRoleId: null, deleteGrantIds: ['10', '12'] })
  })
  it('converges multiple onto an already-held role: keeps it, deletes the rest', () => {
    expect(computeHubRoleOps([hub('10', 5), hub('12', 4)], '5'))
      .toEqual({ createRoleId: null, deleteGrantIds: ['12'] })
  })
  it('None with no hub grants is a no-op', () => {
    expect(computeHubRoleOps([], null)).toEqual({ createRoleId: null, deleteGrantIds: [] })
  })
})
