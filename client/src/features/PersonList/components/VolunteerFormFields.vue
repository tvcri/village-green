<script setup>
import MultiSelect from 'primevue/multiselect'
import IftaLabel from 'primevue/iftalabel'
import Textarea from 'primevue/textarea'
import { uncertainText as sharedUncertainText } from '../lib/uncertainText.js'
import RoleStatusRow from './RoleStatusRow.vue'

const props = defineProps({
  capabilityOptions: { type: Array, required: true },
  villageOptions: { type: Array, required: true },
  uncertain: { type: Object, default: () => ({}) },
  errors: { type: Object, default: () => ({}) },
  dropReasons: { type: Array, default: () => [] },       // volunteer drop-reason catalog rows
  loadedDropReasonId: { type: String, default: null },   // stored reason, offered even when retired
})
const emit = defineEmits(['edited'])

// providerType has no control in this panel (set/edited by the parent) but is
// still declared as a model so the panel's v-model:provider-type contract
// stays symmetric with its sibling fields.
// eslint-disable-next-line no-unused-vars
const providerType = defineModel('providerType', { type: String, default: '' })
const status = defineModel('status', { type: String, default: 'Pending' })
const dropReasonId = defineModel('dropReasonId', { type: String, default: null })
const statusChangeNotes = defineModel('statusChangeNotes', { type: String, default: '' })
const notes = defineModel('notes', { type: String, default: '' })
const selectedCapabilityIds = defineModel('selectedCapabilityIds', { type: Array, required: true })
const selectedAssociateVillageIds = defineModel('selectedAssociateVillageIds', { type: Array, required: true })

// Clear a field's validation error as soon as the user changes it.
function edited (field) {
  delete props.errors[field]
  emit('edited', field)
}

function uncertainText (field) { return sharedUncertainText(props.uncertain, field) }
</script>

<template>
  <div class="section">
    <h3 class="section-header">Provider</h3>

    <RoleStatusRow v-model:status="status" v-model:dropReasonId="dropReasonId" idKey="volunteerDropReasonId"
                   :reasons="dropReasons" :loadedDropReasonId="loadedDropReasonId"
                   :errors="errors" :uncertain="uncertain" @edited="edited" />

    <div class="form-field span-4">
      <IftaLabel>
        <MultiSelect id="capabilities" v-model="selectedCapabilityIds"
                     :options="capabilityOptions" optionLabel="name" optionValue="capabilityId"
                     display="chip" placeholder="Select capabilities" class="w-full" />
        <label for="capabilities">
          Capabilities
          <i v-if="uncertain.selectedCapabilityIds" class="pi pi-exclamation-triangle uncertain-icon"
             v-tooltip.top="uncertainText('selectedCapabilityIds')" />
        </label>
      </IftaLabel>
    </div>

    <div class="form-field span-4">
      <IftaLabel>
        <Textarea id="volunteerNotes" v-model="notes"
                  rows="4" class="w-full" />
        <label for="volunteerNotes">Notes</label>
      </IftaLabel>
    </div>

    <div class="form-field span-4">
      <IftaLabel>
        <Textarea id="statusChangeNotes" v-model="statusChangeNotes" rows="3" class="w-full" />
        <label for="statusChangeNotes">Status Change Notes</label>
      </IftaLabel>
    </div>

    <div class="form-field ">
      <IftaLabel>
        <MultiSelect id="associateVillages" v-model="selectedAssociateVillageIds"
                     :options="villageOptions" optionLabel="name" optionValue="villageId"
                     display="chip" placeholder="Select villages" class="w-full" />
        <label for="associateVillages">
          Associate Villages
          <i v-if="uncertain.associateVillageIds" class="pi pi-exclamation-triangle uncertain-icon"
             v-tooltip.top="uncertainText('associateVillageIds')" />
        </label>
      </IftaLabel>
    </div>

  </div>

</template>

<style scoped src="./formFields.css"></style>
<style scoped>
.section {
  grid-template-columns: repeat(4, 1fr);
}
.form-field.span-4 { grid-column: 1 / -1; }

@media (max-width: 900px) {
  .section { grid-template-columns: 1fr 1fr; }
  .form-field.span-4 { grid-column: span 2; }
}
@media (max-width: 600px) {
  .section { grid-template-columns: 1fr; }
  .form-field.span-4 { grid-column: span 1; }
}
</style>
