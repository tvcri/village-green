import { ref } from 'vue'

// Module-scoped singleton. The block is driven entirely by the API: any 403
// privacy_ack_required (at bootstrap or mid-session) calls requireAck(). There
// is no client-side status snapshot to seed from — the API is the source of
// truth. The modal acknowledges the version it fetched, so no id is tracked here.
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
