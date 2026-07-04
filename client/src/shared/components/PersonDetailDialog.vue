<script setup>
import { computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import ProgressSpinner from 'primevue/progressspinner'
import { useAsyncState } from '../composables/useAsyncState.js'
import { apiCall } from '../api/apiClient.js'
import PersonDetailCard from './PersonDetailCard.vue'

defineOptions({ name: 'PersonDetailDialog' })

const props = defineProps({
  visible: { type: Boolean, default: false },
  personId: { type: [String, Number], default: null },
})

const emit = defineEmits(['update:visible'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
})

// Fetch is manual (immediate: false) and re-triggered every time the dialog
// opens, so the person data is always fresh. onError is null so a failure
// shows our inline message instead of the global error modal.
const { state: person, isLoading, error, execute: fetchPerson } = useAsyncState(
  () => apiCall('getPerson', { personId: props.personId, projection: ['memberInfo', 'volunteerInfo'] }),
  { immediate: false, onError: null },
)

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible && props.personId != null) {
      fetchPerson()
    }
  },
)

const personType = computed(() => {
  const roles = person.value?.roles ?? []
  const isMember = roles.includes('member')
  const isVolunteer = roles.includes('volunteer')
  if (isMember && isVolunteer) return 'member, volunteer'
  if (isVolunteer) return 'volunteer'
  return 'member'
})

const flatPerson = computed(() => {
  if (!person.value) return null
  const { memberInfo, volunteerInfo, ...rest } = person.value
  return { ...rest, ...memberInfo, ...volunteerInfo }
})
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    :pt="{ header: { style: { justifyContent: 'flex-end' } } }"
    :style="{ width: '72rem' }"
    :breakpoints="{ '1200px': '95vw' }"
  >
    <div v-if="isLoading" class="dialog-state">
      <ProgressSpinner style="width: 2rem; height: 2rem" strokeWidth="4" />
      <span>Loading…</span>
    </div>
    <p v-else-if="error" class="dialog-state error">Failed to load person details.</p>
    <PersonDetailCard v-else-if="flatPerson" :person="flatPerson" :person-type="personType" />
  </Dialog>
</template>

<style scoped>
.dialog-state {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 0;
  color: var(--color-text-dim);
}

.dialog-state.error {
  color: var(--color-error);
}
</style>
