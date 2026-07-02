<script setup>
import { ref, onMounted } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { marked } from 'marked'
import { getPrivacyRules, createPrivacyAcknowledgement } from '../features/Admin/api/privacyApi.js'

const visible = ref(false)
const rulesHtml = ref('')
const pendingRulesId = ref(null)
const acknowledging = ref(false)
const error = ref(null)

onMounted(async () => {
  if (!VG.curUser?.privacyStatus?.needsAck) return
  pendingRulesId.value = VG.curUser.privacyStatus.pendingRulesId
  try {
    const rules = await getPrivacyRules()
    rulesHtml.value = marked.parse(rules.content)
    visible.value = true
  }
  catch (err) {
    console.error('[PrivacyAckModal] Failed to load rules:', err)
  }
})

async function acknowledge() {
  acknowledging.value = true
  error.value = null
  try {
    await createPrivacyAcknowledgement(pendingRulesId.value)
    VG.curUser.privacyStatus.needsAck = false
    visible.value = false
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
    v-model:visible="visible"
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
