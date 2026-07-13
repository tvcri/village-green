import { beforeEach, describe, expect, it } from 'vitest'
import { useCurrentUser } from './useCurrentUser.js'

describe('useCurrentUser permissions', () => {
  beforeEach(() => {
    globalThis.VG = { curUser: {
      permissions: { federation: ['sr:read'], byVillage: { 3: ['member:read'] } },
      grants: { 3: { villageId: '3', name: 'Elm', roles: [{ roleId: '3', name: 'Village Lead' }], grantIds: ['10'] } },
      federationGrants: [],
      canElevate: false,
    } }
  })

  it('federation permission applies everywhere', () => {
    const { hasPermission } = useCurrentUser()
    expect(hasPermission('sr:read')).toBe(true)
    expect(hasPermission('sr:read', 9)).toBe(true)
  })

  it('village permission is village-bound', () => {
    const { hasPermission } = useCurrentUser()
    expect(hasPermission('member:read', 3)).toBe(true)
    expect(hasPermission('member:read', 4)).toBe(false)
    expect(hasPermission('member:read')).toBe(false)
  })

  it('wildcard covers all permissions', () => {
    VG.curUser.permissions.federation = ['*']
    const { hasPermission } = useCurrentUser()
    expect(hasPermission('user:admin')).toBe(true)
  })

  it('village access and grantless detection', () => {
    const { hasVillageAccess, isGrantless } = useCurrentUser()
    expect(hasVillageAccess('3')).toBe(true)
    expect(hasVillageAccess('4')).toBe(false)
    expect(isGrantless.value).toBe(false)
    VG.curUser.grants = {}
    VG.curUser.federationGrants = []
    expect(useCurrentUser().isGrantless.value).toBe(true)
  })
})
