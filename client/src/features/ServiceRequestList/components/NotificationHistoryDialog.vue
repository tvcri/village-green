<script setup>
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getServiceRequest, updateServiceRequest } from '../api/serviceRequestApi.js'
import NotificationHistoryList from './NotificationHistoryList.vue'

defineOptions({ name: 'NotificationHistoryDialog' })

const props = defineProps({
  visible: { type: Boolean, default: false },
  serviceRequestId: { type: [String, Number], default: null },
  displayLabel: { type: [String, Number], default: null },
  allowSendButton: { type: Boolean, default: false },
  status: { type: String, default: null },
})

const emit = defineEmits(['update:visible', 'notified'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
})

// Fetch is manual (immediate: false) and re-triggered every time the dialog
// opens, so the history is always fresh. onError is null so a failure shows
// our inline message instead of the global error modal.
const { state: request, isLoading, error, execute: fetchHistory } = useAsyncState(
  () => getServiceRequest(props.serviceRequestId, ['notificationHistory']),
  { immediate: false, onError: null },
)

const history = computed(() => request.value?.notificationHistory ?? [])

const title = computed(() =>
  props.displayLabel != null ? `Notifications — #${props.displayLabel}` : 'Notifications',
)

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible && props.serviceRequestId != null) {
      fetchHistory()
    }
  },
)

const isSending = ref(false)
const sendError = ref(null)

async function sendNotification() {
  isSending.value = true
  sendError.value = null
  try {
    const updated = await updateServiceRequest(props.serviceRequestId, { notify: true }, ['notificationHistory'])
    emit('notified', updated)
    dialogVisible.value = false
  } catch {
    sendError.value = 'Failed to send notification.'
  } finally {
    isSending.value = false
  }
}
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    :header="title"
    :style="{ width: '32rem' }"
    :breakpoints="{ '640px': '90vw' }"
  >
    <div v-if="isLoading" class="dialog-state">
      <ProgressSpinner style="width: 2rem; height: 2rem" strokeWidth="4" />
      <span>Loading…</span>
    </div>
    <p v-else-if="error" class="dialog-state error">
      Couldn't load notification history.
    </p>
    <NotificationHistoryList v-else :history="history" />

    <template v-if="allowSendButton && !isLoading && status?.toLowerCase() === 'open'" #footer>
      <p v-if="sendError" class="send-error">{{ sendError }}</p>
      <Button
        :label="history.length > 0 ? 'Resend Notification' : 'Send Notification'"
        icon="pi pi-envelope"
        :loading="isSending"
        @click="sendNotification"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-state {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--color-text-dim);
  padding: 0.5rem 0;
}

.dialog-state.error {
  color: var(--color-text-error);
  margin: 0;
}

.send-error {
  color: var(--color-text-error);
  margin: 0 auto 0 0;
  font-size: 0.875rem;
}
</style>
