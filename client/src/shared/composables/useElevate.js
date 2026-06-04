import { ref, computed } from 'vue'
import { useCurrentUser } from './useCurrentUser.js'

const elevateEnabled = ref(false)

export function useElevate() {
  const { isAdmin } = useCurrentUser()

  // Only admins can use elevate
  const canElevate = computed(() => isAdmin.value)

  // Return elevate value for API calls (true/false or undefined)
  const elevate = computed(() => elevateEnabled.value ? true : undefined)

  function toggleElevate() {
    if (canElevate.value) {
      elevateEnabled.value = !elevateEnabled.value
    }
  }

  return {
    elevateEnabled,
    canElevate,
    elevate,
    toggleElevate,
  }
}
