import { ref, computed } from 'vue'
import { getRoles as getRolesApi } from '../api/userApi.js'

// Module-level cache: roles rarely change and are fetched from GET /op/roles
// once per session, shared across every consumer (grant editors, role dropdowns).
const roles = ref([])
const isLoading = ref(false)
const isLoaded = ref(false)
let fetchPromise = null

export function useRoles() {
  const fetchRoles = () => {
    if (isLoaded.value) return Promise.resolve(roles.value)
    if (fetchPromise) return fetchPromise

    isLoading.value = true
    fetchPromise = getRolesApi()
      .then((result) => {
        roles.value = result
        isLoaded.value = true
        return roles.value
      })
      .finally(() => {
        isLoading.value = false
        fetchPromise = null
      })

    return fetchPromise
  }

  const getRoleLabel = (roleId) => {
    const role = roles.value.find((r) => String(r.roleId) === String(roleId))
    return role?.name || `Role ${roleId}`
  }

  // Village-scoped roles: assignable on a per-village grant (villageId required).
  const villageRoles = computed(() => roles.value.filter((r) => r.scope === 'village'))

  // Federation-scoped roles: assignable federation-wide (villageId null).
  const federationRoles = computed(() => roles.value.filter((r) => r.scope === 'federation'))

  return {
    roles,
    villageRoles,
    federationRoles,
    isLoading,
    fetchRoles,
    getRoleLabel,
  }
}
