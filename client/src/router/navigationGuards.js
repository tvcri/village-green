import { useCurrentUser } from '../shared/composables/useCurrentUser.js'

export function navigationGuard(to) {
  const { hasPermission, hasVillageAccess, hasFederationAccess } = useCurrentUser()

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
