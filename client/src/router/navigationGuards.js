import { useCurrentUser } from '../shared/composables/useCurrentUser.js'

const { isAdmin, hasCollectionAccess, getCollectionRoleId } = useCurrentUser()

export function navigationGuard(to) {
  console.log('navigationGuard called for route:', to.name, 'params:', to.params, 'isAdmin.value:', isAdmin.value)

  // VSS: the volunteer surface requires identity-derived volunteer access
  if (to.meta.requiresVolunteer && !VG.curUser?.volunteer) {
    return { name: 'villages' }
  }

  // VSS: volunteer-only users (no grants, not admin) live on the volunteer
  // surface — the staff app would be all 403s for them anyway
  const isVolunteerOnly =
    !!VG.curUser?.volunteer &&
    !isAdmin.value &&
    !(VG.curUser?.villageGrants?.length)
  if (isVolunteerOnly && to.name !== 'volunteer') {
    return { name: 'volunteer' }
  }

  // admin routes
  if (to.meta.requiresAdmin && !isAdmin.value) {
    return { name: 'villages' }
  }

  // Temporary: Meta Village section is limited to users with exactly 13 village grants
  if (to.path === '/meta' || to.path.startsWith('/meta/')) {
    const grantCount = VG.curUser?.villageGrants?.length ?? 0
    if (grantCount !== 13) {
      return { name: 'villages' }
    }
  }

  // village-specific routes require a village grant (skip if in admin section)
  if (to.params.villageId && !to.meta.requiresAdmin) {
    const villageId = String(to.params.villageId)
    const villageGrants = VG.curUser?.villageGrants || []
    console.log('navigationGuard village check:', { villageId, isAdmin: isAdmin.value, villageGrants, grantIds: villageGrants.map(g => String(g.village?.villageId)) })
    const hasGrant = villageGrants.some(grant => String(grant.village?.villageId) === villageId)
    console.log('hasGrant:', hasGrant)
    if (!hasGrant) {
      console.log('Redirecting to villages - no grant found')
      return { name: 'villages' }
    }
  }

  // collection-specific routes require a collection grant
  if (to.meta.requiresCollectionGrant) {
    const collectionId = to.params.collectionId
    if (!hasCollectionAccess(collectionId)) {
      return { name: 'collections' }
    }
    // role-level gate (e.g. manage requires roleId >= 3) for manage routes
    if (to.meta.minRoleId) {
      const roleId = getCollectionRoleId(collectionId)
      if (roleId < to.meta.minRoleId) {
        return { name: 'collection', params: { collectionId } }
      }
    }
  }
}
