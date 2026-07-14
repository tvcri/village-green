import { computed } from 'vue'

export function useCurrentUser() {
  const user = computed(() => VG.curUser)

  function hasPermission(permission, villageId) {
    const p = user.value?.permissions
    if (!p) return false
    if (p.federation.includes('*') || p.federation.includes(permission)) return true
    if (villageId !== undefined && villageId !== null) {
      return !!p.byVillage?.[String(villageId)]?.includes(permission)
    }
    return false
  }

  function hasVillageAccess(villageId) {
    return !!user.value?.grants?.[String(villageId)]
  }

  const hasFederationAccess = computed(() => (user.value?.federationGrants?.length ?? 0) > 0)
  const canElevate = computed(() => !!user.value?.canElevate)
  const isGrantless = computed(() =>
    Object.keys(user.value?.grants ?? {}).length === 0
    && (user.value?.federationGrants?.length ?? 0) === 0,
  )

  return { user, hasPermission, hasVillageAccess, hasFederationAccess, canElevate, isGrantless }
}
