<script setup>
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { getPrivacyRules, createPrivacyAcknowledgement } from '../features/Admin/api/privacyApi.js'
import { usePrivacyAck } from '../shared/composables/usePrivacyAck.js'

const { needsAck } = usePrivacyAck()

const rulesHtml = ref('')
// The id of the rules version actually fetched and displayed. We acknowledge
// THIS id — you ack what you saw — rather than an id passed through the 403.
const displayedRulesId = ref(null)
const acknowledging = ref(false)
const loading = ref(false)
const loadError = ref(false)
const error = ref(null)

// Load (or reload) rules content whenever the modal becomes required.
// Handles both cold-start and mid-session re-block (new version / interval).
async function loadRules() {
  loading.value = true
  loadError.value = false
  try {
    const [rules, { marked }] = await Promise.all([getPrivacyRules(), import('marked')])
    rulesHtml.value = marked.parse(rules.content)
    displayedRulesId.value = rules.id
  }
  catch (err) {
    // Leave the ack blocked: without visible rules the user must not be able to
    // agree. Surface a retry instead of a silent blank modal.
    loadError.value = true
    console.error('[PrivacyAckModal] Failed to load rules:', err)
  }
  finally {
    loading.value = false
  }
}

watch(needsAck, (blocked) => {
  if (blocked) loadRules()
}, { immediate: true })

async function acknowledge() {
  acknowledging.value = true
  error.value = null
  try {
    await createPrivacyAcknowledgement(displayedRulesId.value)
    // Reload for a clean, fully-authorized bootstrap. On cold-start block the
    // user object was a minimal stub (every endpoint 403'd), so we can't just
    // unhide the app — reload re-fetches the real user now that the gate is clear.
    window.location.reload()
  }
  catch (err) {
    error.value = 'Failed to record acknowledgement. Please try again.'
    console.error('[PrivacyAckModal] Ack failed:', err)
    acknowledging.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="needsAck"
    modal
    :closable="false"
    :close-on-escape="false"
    style="width: 600px; max-width: 95vw"
    :pt="{ mask: { class: 'privacy-modal-mask' } }"
  >
    <template #header>
      <div class="privacy-header">
        <img src="/tvcri-logo.svg" alt="Village Green Logo" class="privacy-logo" />
        <span>Data Privacy Agreement</span>
      </div>
    </template>
    <div v-if="loading" class="privacy-loading">Loading…</div>
    <div v-else-if="loadError" class="privacy-load-error">
      <p class="privacy-error">Failed to load the privacy agreement.</p>
      <Button label="Retry" severity="secondary" @click="loadRules" />
    </div>
    <div v-else class="privacy-content" v-html="rulesHtml" />
    <p v-if="error" class="privacy-error">{{ error }}</p>
    <template #footer>
      <Button
        label="I Agree"
        :loading="acknowledging"
        :disabled="acknowledging || loading || loadError || !rulesHtml"
        @click="acknowledge"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.privacy-header {
  display: flex;
  align-items: flex-end;
  gap: 1.75rem;
  font-size: 2rem;
  font-weight:700
}

.privacy-logo {
  height: 64px;
  width: auto;
}

.privacy-content {
  max-height: 60vh;
  overflow-y: auto;
  line-height: 1.6;
}

.privacy-error {
  color: var(--p-red-500);
  margin-top: 0.75rem;
  font-size: 0.9rem;
}

.privacy-loading {
  padding: 2rem 0;
  text-align: center;
  color: var(--color-text-dim);
}

.privacy-load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 0;
}
</style>
