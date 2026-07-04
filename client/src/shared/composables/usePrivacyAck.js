import { ref } from 'vue'

// Module-scoped singleton. Seeded at bootstrap from GET /user's privacyStatus
// (allowlisted, so it's readable even while blocked) and kept in sync
// mid-session by the apiClient 403 interceptor. The modal acknowledges the
// version it fetched, so no id is tracked here — just the boolean gate.
const needsAck = ref(false)

export function usePrivacyAck() {
  function clearAck() {
    needsAck.value = false
  }
  function requireAck() {
    needsAck.value = true
  }
  return { needsAck, clearAck, requireAck }
}
