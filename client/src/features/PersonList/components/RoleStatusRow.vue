<script setup>
import { computed } from 'vue'
import Select from 'primevue/select'
import IftaLabel from 'primevue/iftalabel'
import { uncertainText as sharedUncertainText } from '../lib/uncertainText.js'
import { dropReasonOptions } from '../lib/memberFormValidation.js'

// Status | Drop Reason | empty-list hint, shared by the member and volunteer
// forms. The root is a subgrid so it keeps the parent section's columns.
const props = defineProps({
  reasons: { type: Array, default: () => [] },   // drop-reason catalog rows
  idKey: { type: String, default: 'memberDropReasonId' }, // 'memberDropReasonId' | 'volunteerDropReasonId'
  loadedDropReasonId: { type: String, default: null }, // stored reason, offered even when retired
  errors: { type: Object, default: () => ({}) },
  uncertain: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['edited'])

const status = defineModel('status')
const dropReasonId = defineModel('dropReasonId')

const statusOptions = ['Pending', 'Active', 'Dropped'].map(s => ({ label: s, value: s }))
const dropReasonSelectOptions = computed(() => dropReasonOptions(props.reasons, props.loadedDropReasonId, props.idKey))

function edited (field) { emit('edited', field) }
function uncertainText (field) { return sharedUncertainText(props.uncertain, field) }
</script>

<template>
  <!-- Status gets a row of its own; Drop Reason and its hint join it. -->
  <div class="status-row">
    <div class="form-field">
      <IftaLabel>
        <Select id="status" v-model="status" :options="statusOptions"
                optionLabel="label" optionValue="value" placeholder="Select status" class="w-full" @update:modelValue="edited('status')" />
        <label for="status">Status
          <i v-if="uncertain.status" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('status')" />
        </label>
      </IftaLabel>
    </div>

    <div v-if="status === 'Dropped'" class="form-field">
      <IftaLabel>
        <Select id="dropReasonId" v-model="dropReasonId" :options="dropReasonSelectOptions"
                optionLabel="label" optionValue="value" placeholder="Select drop reason" class="w-full"
                :class="{ 'p-invalid': errors.dropReasonId }" @update:modelValue="edited('dropReasonId')" />
        <label for="dropReasonId">Drop Reason</label>
      </IftaLabel>
      <small class="field-error" v-if="errors.dropReasonId">{{ errors.dropReasonId }}</small>
    </div>
    <small v-if="status === 'Dropped' && !reasons.length" class="field-hint drop-reason-hint">No drop reasons yet. An administrator adds them under Admin › Drop Reasons.</small>
  </div>
</template>

<style scoped src="./formFields.css"></style>
<style scoped>
/* subgrid keeps Status and Drop Reason on the section's columns. */
.status-row {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  row-gap: 1rem;
  align-items: start;
}

.drop-reason-hint {
  grid-column: span 2;
  align-self: center;
  margin-top: 0;
}

@media (max-width: 600px) {
  .drop-reason-hint {
    grid-column: auto;
  }
}
</style>
