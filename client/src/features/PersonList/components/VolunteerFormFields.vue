<script setup>
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import Textarea from 'primevue/textarea'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'

const props = defineProps({
  providerType: { type: String, default: '' },
  active: { type: Boolean, default: true },
  notes: { type: String, default: '' },
  selectedCapabilityIds: { type: Array, required: true },
  selectedAssociateVillageIds: { type: Array, required: true },
  capabilityOptions: { type: Array, required: true },
  villageOptions: { type: Array, required: true },
  vettings: { type: Array, default: () => [] },
  showVettings: { type: Boolean, default: false },
  uncertain: { type: Object, default: () => ({}) },
})
defineEmits([
  'update:providerType', 'update:active', 'update:notes',
  'update:selectedCapabilityIds', 'update:selectedAssociateVillageIds',
])

const providerTypeOptions = [
  'Non-member Volunteer',
  'Member Volunteer',
].map(t => ({ label: t, value: t }))

function uncertainText (field) {
  const u = props.uncertain[field]
  return u?.alternative ? `${u.reason} — alternative: ${u.alternative}` : u?.reason
}
</script>

<template>
  <div class="section">
    <h3 class="section-header">Provider</h3>

    <div class="form-field">
      <label class="label" for="providerType">Provider Type</label>
      <Select id="providerType" :modelValue="providerType" @update:modelValue="$emit('update:providerType', $event)"
              :options="providerTypeOptions" optionLabel="label" optionValue="value"
              placeholder="Select provider type" class="w-full" />
    </div>

    <div class="form-field checkbox-field">
      <label class="checkbox-item">
        <Checkbox :modelValue="active" @update:modelValue="$emit('update:active', $event)" binary />
        <span class="checkbox-label">Active</span>
      </label>
    </div>

    <div class="form-field span-2">
      <label class="label" for="associateVillages">
        Associate Villages
        <i v-if="uncertain.associateVillageIds" class="pi pi-exclamation-triangle uncertain-icon"
           v-tooltip.top="uncertainText('associateVillageIds')" />
      </label>
      <MultiSelect id="associateVillages" :modelValue="selectedAssociateVillageIds"
                   @update:modelValue="$emit('update:selectedAssociateVillageIds', $event)"
                   :options="villageOptions" optionLabel="name" optionValue="villageId"
                   display="chip" placeholder="Select villages" class="w-full" />
    </div>

    <div class="form-field span-4">
      <label class="label" for="capabilities">
        Capabilities
        <i v-if="uncertain.selectedCapabilityIds" class="pi pi-exclamation-triangle uncertain-icon"
           v-tooltip.top="uncertainText('selectedCapabilityIds')" />
      </label>
      <MultiSelect id="capabilities" :modelValue="selectedCapabilityIds"
                   @update:modelValue="$emit('update:selectedCapabilityIds', $event)"
                   :options="capabilityOptions" optionLabel="name" optionValue="capabilityId"
                   display="chip" placeholder="Select capabilities" class="w-full" />
    </div>

    <div class="form-field span-4">
      <label class="label" for="volunteerNotes">Notes</label>
      <Textarea id="volunteerNotes" :modelValue="notes" @update:modelValue="$emit('update:notes', $event)"
                rows="4" class="w-full" />
    </div>
  </div>

  <div v-if="showVettings" class="section">
    <h3 class="section-header">Vettings</h3>
    <div class="form-field span-4">
      <DataTable :value="vettings" size="small">
        <Column field="name" header="Type"></Column>
        <Column field="dateEntered" header="Date Entered"></Column>
        <Column field="dateExpired" header="Date Expired"></Column>
        <template #empty>No vettings on record.</template>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.section {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem 1.5rem;
  margin-top: 2rem;
  margin-bottom: 2rem;
}
.section:first-of-type { margin-top: 1rem; }
.section:last-child { margin-bottom: 0; }
.section-header {
  grid-column: 1 / -1;
  margin: 0 0 0.75rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--p-primary-600);
  border-bottom: 2px solid var(--color-border-default);
  padding-bottom: 0.75rem;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.form-field.span-2 { grid-column: span 2; }
.form-field.span-4 { grid-column: 1 / -1; }
.label {
  font-weight: 600;
  color: var(--color-text-dim);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.w-full { width: 100%; }
.checkbox-field { justify-content: flex-end; }
.checkbox-item { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
.checkbox-label { font-size: 1rem; color: var(--color-text-primary); }
.uncertain-icon { color: var(--p-amber-500, #f59e0b); margin-left: 0.35rem; cursor: help; }

@media (max-width: 900px) {
  .section { grid-template-columns: 1fr 1fr; }
  .form-field.span-2, .form-field.span-4 { grid-column: span 2; }
}
@media (max-width: 600px) {
  .section { grid-template-columns: 1fr; }
  .form-field.span-2, .form-field.span-4 { grid-column: span 1; }
}
</style>
