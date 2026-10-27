<script setup>
import { computed, ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import DatePicker from 'primevue/datepicker'
import RadioButton from 'primevue/radiobutton'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { putVolunteerPause, deleteVolunteerPause } from '../api/roleApi.js'
import { isPrivacyAckError, apiErrorMessage } from '../../../shared/api/apiClient.js'
import { serviceDateToDate, dateToServiceDate, todayCivilDateIn } from '../../../shared/lib/civilDate.js'
import { PAUSE_TIME_ZONE } from '../../../shared/lib/volunteerPause.js'

const props = defineProps({
  personId: { type: String, required: true },
  pause: { type: Object, default: null }
})
const visible = defineModel('visible', { type: Boolean, default: false })
const emit = defineEmits(['saved'])
const toast = useToast()

const startDate = ref(null) // civil strings, or null
const endDate = ref(null)
const scope = ref('all')
const saving = ref(false)
const errorText = ref('')

// Re-seed from the stored pause each time the dialog opens.
watch(visible, v => {
  if (!v) return
  startDate.value = props.pause?.startDate ?? null
  endDate.value = props.pause?.endDate ?? null
  scope.value = props.pause?.scope ?? 'all'
  errorText.value = ''
}, { immediate: true })

const windowAllowed = computed(() => !!startDate.value && !!endDate.value)
// A window needs both dates; if one is cleared, fall back to "all".
watch(windowAllowed, ok => { if (!ok && scope.value === 'window') scope.value = 'all' })

const endPassed = computed(() => !!endDate.value && endDate.value < todayCivilDateIn(PAUSE_TIME_ZONE))

async function run (call, done, failed) {
  saving.value = true
  errorText.value = ''
  try {
    await call()
    toast.add({ severity: 'success', summary: done, life: 2000 })
    visible.value = false
    emit('saved')
  } catch (err) {
    if (isPrivacyAckError(err)) return
    // The API's 422 copy is written for the user; show it as is.
    errorText.value = apiErrorMessage(err, failed)
  } finally {
    saving.value = false
  }
}

const save = () => run(
  () => putVolunteerPause(props.personId, { startDate: startDate.value, endDate: endDate.value, scope: scope.value }),
  'Pause saved', 'Failed to save the pause')
const unpause = () => run(() => deleteVolunteerPause(props.personId), 'Volunteer unpaused', 'Failed to unpause')
</script>

<template>
  <Dialog v-model:visible="visible" modal header="Pause Volunteer" :style="{ width: '28rem' }">
    <div class="pause-form">
      <div class="field">
        <label for="pause-start">Start date</label>
        <DatePicker inputId="pause-start" :modelValue="serviceDateToDate(startDate)" dateFormat="mm/dd/yy" showIcon showButtonBar fluid
                    @update:modelValue="d => { startDate = dateToServiceDate(d) }" />
        <small class="help">Today if blank</small>
      </div>
      <div class="field">
        <label for="pause-end">End date</label>
        <DatePicker inputId="pause-end" :modelValue="serviceDateToDate(endDate)" dateFormat="mm/dd/yy" showIcon showButtonBar fluid
                    @update:modelValue="d => { endDate = dateToServiceDate(d) }" />
        <small class="help">Until unpaused</small>
      </div>
      <Message v-if="endPassed" severity="warn" :closable="false">The end date has passed, so this pause would have no effect.</Message>
      <fieldset class="scope">
        <legend>Applies to</legend>
        <label class="radio"><RadioButton v-model="scope" value="all" inputId="pause-scope-all" /> All new-request emails</label>
        <small class="help">No new-request emails while paused. Can't be assigned to requests dated in the pause.</small>
        <label class="radio" :class="{ disabled: !windowAllowed }">
          <RadioButton v-model="scope" value="window" inputId="pause-scope-window" :disabled="!windowAllowed" /> Only requests with a service date in these dates
        </label>
        <small class="help">Needs both dates. No emails about requests dated in these dates, and can't be assigned to them.</small>
      </fieldset>
      <Message v-if="errorText" severity="error" :closable="false">{{ errorText }}</Message>
    </div>
    <template #footer>
      <Button v-if="pause" label="Unpause" severity="danger" text :disabled="saving" @click="unpause" />
      <Button label="Cancel" severity="secondary" text :disabled="saving" @click="visible = false" />
      <Button label="Save" :loading="saving" @click="save" />
    </template>
  </Dialog>
</template>

<style scoped>
.pause-form { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.25rem; }
.help { color: var(--color-text-dim); }
.scope { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.scope legend { font-size: 0.875rem; margin-bottom: 0.25rem; }
.radio { display: flex; align-items: center; gap: 0.5rem; }
.radio.disabled { opacity: 0.6; }
</style>
