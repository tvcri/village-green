<script setup>
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { getPrivacyRules, createPrivacyAcknowledgement } from '../features/Admin/api/privacyApi.js'
import { usePrivacyAck } from '../shared/composables/usePrivacyAck.js'

const { needsAck, pendingRulesId, clearAck } = usePrivacyAck()

const rulesHtml = ref('')
const acknowledging = ref(false)
const error = ref(null)
let loadedForRulesId = null

// Load (or reload) rules content whenever the modal becomes required.
// Handles both cold-start and mid-session re-block (new version / interval).
watch(needsAck, async (blocked) => {
  if (!blocked) return
  if (loadedForRulesId === pendingRulesId.value && rulesHtml.value) return
  try {
    const [rules, { marked }] = await Promise.all([getPrivacyRules(), import('marked')])
    rulesHtml.value = marked.parse(rules.content)
    loadedForRulesId = pendingRulesId.value
  }
  catch (err) {
    console.error('[PrivacyAckModal] Failed to load rules:', err)
  }
}, { immediate: true })

async function acknowledge() {
  acknowledging.value = true
  error.value = null
  try {
    await createPrivacyAcknowledgement(pendingRulesId.value)
    clearAck()
  }
  catch (err) {
    error.value = 'Failed to record acknowledgement. Please try again.'
    console.error('[PrivacyAckModal] Ack failed:', err)
  }
  finally {
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
    <div class="privacy-content" v-html="rulesHtml" />
    <p v-if="error" class="privacy-error">{{ error }}</p>
    <template #footer>
      <Button
        label="I Agree"
        :loading="acknowledging"
        :disabled="acknowledging"
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
</style>
