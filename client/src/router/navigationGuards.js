import { useCurrentUser } from '../shared/composables/useCurrentUser.js'

export function navigationGuard(to) {
  const { user, hasPermission, hasVillageAccess, hasFederationAccess, isGrantless } = useCurrentUser()

  // VSS: the volunteer surface requires identity-derived volunteer access.
  // Read volunteer status from the same composable source as isGrantless
  // (user is computed(() => VG.curUser)) so both derive from one value.
  const isVolunteer = !!user.value?.volunteer
  if (to.meta.requiresVolunteer && !isVolunteer) {
    return { name: 'villages' }
  }

  // VSS: volunteer-only users (volunteer identity, no role grants) live on the
  // volunteer surface — the staff app would be all 403s for them anyway
  const isVolunteerOnly = isVolunteer && isGrantless.value
  const isVolunteerRoute = to.name === 'volunteer' || to.name === 'volunteer-request-detail'
  if (isVolunteerOnly && !isVolunteerRoute) {
    return { name: 'volunteer' }
  }

  if (to.meta.requiresPermission) {
    const villageId = to.meta.villageScoped ? to.params.villageId : undefined
    if (!hasPermission(to.meta.requiresPermission, villageId)) {
      return { name: 'villages' }
    }
  }

  // Meta section requires some federation-scoped role
  if (to.path === '/meta' || to.path.startsWith('/meta/')) {
    if (!hasFederationAccess.value) return { name: 'villages' }
  }

  // village-scoped routes require any grant on that village
  if (to.params.villageId && !to.meta.requiresPermission) {
    if (!hasVillageAccess(to.params.villageId)) return { name: 'villages' }
  }
}
