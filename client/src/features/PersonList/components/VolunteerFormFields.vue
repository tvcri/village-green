<script setup>
import MultiSelect from 'primevue/multiselect'
import IftaLabel from 'primevue/iftalabel'
import Checkbox from 'primevue/checkbox'
import Textarea from 'primevue/textarea'
import { uncertainText as sharedUncertainText } from '../lib/uncertainText.js'

const props = defineProps({
  capabilityOptions: { type: Array, required: true },
  villageOptions: { type: Array, required: true },
  uncertain: { type: Object, default: () => ({}) },
})

// providerType has no control in this panel (set/edited by the parent) but is
// still declared as a model so the panel's v-model:provider-type contract
// stays symmetric with its sibling fields.
// eslint-disable-next-line no-unused-vars
const providerType = defineModel('providerType', { type: String, default: '' })
const active = defineModel('active', { type: Boolean, default: true })
const notes = defineModel('notes', { type: String, default: '' })
const selectedCapabilityIds = defineModel('selectedCapabilityIds', { type: Array, required: true })
const selectedAssociateVillageIds = defineModel('selectedAssociateVillageIds', { type: Array, required: true })

function uncertainText (field) { return sharedUncertainText(props.uncertain, field) }
</script>

<template>
  <div class="section">
    <div class="section-header-row">
      <h3 class="section-header">Provider</h3>
      <label class="checkbox-item">
        <Checkbox v-model="active" binary />
        <span class="checkbox-label">Active</span>
      </label>
    </div>

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
.section-header-row {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}
.section-header-row .section-header {
  margin: 0;
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
