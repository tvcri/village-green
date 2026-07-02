import { ref } from 'vue'

// Module-scoped singletons. Seeded once from the non-reactive VG global so
// that mutations flow through Vue reactivity (VG.curUser itself is not reactive).
const needsAck = ref(globalThis.VG?.curUser?.privacyStatus?.needsAck ?? false)
const pendingRulesId = ref(globalThis.VG?.curUser?.privacyStatus?.pendingRulesId ?? null)

export function usePrivacyAck() {
  function clearAck() {
    needsAck.value = false
  }
  function requireAck(rulesId) {
    if (rulesId != null) pendingRulesId.value = rulesId
    needsAck.value = true
  }
  return { needsAck, pendingRulesId, clearAck, requireAck }
}
