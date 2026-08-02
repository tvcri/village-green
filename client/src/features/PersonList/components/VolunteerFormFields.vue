<script setup>
import { ref, watch } from 'vue'
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import Textarea from 'primevue/textarea'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import { uncertainText as sharedUncertainText } from '../lib/uncertainText.js'

const props = defineProps({
  capabilityOptions: { type: Array, required: true },
  villageOptions: { type: Array, required: true },
  vettingTypeOptions: { type: Array, default: () => [] },
  showVettings: { type: Boolean, default: false },
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
const vettings = defineModel('vettings', { type: Array, default: () => [] })

function uncertainText (field) { return sharedUncertainText(props.uncertain, field) }

// Dates are exchanged with the API as 'YYYY-MM-DD' strings; PrimeVue's
// DatePicker works in local Date objects. Convert at the edges, using local
// (not UTC) fields so the picker's displayed day never shifts.
function dateStringToDate (s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function dateToDateString (d) {
  if (!d) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const newVettingTypeId = ref(null)
const newDateEntered = ref(null)
const newDateExpired = ref(null)
const duplicateVettingError = ref('')

watch([newVettingTypeId, newDateEntered], () => { duplicateVettingError.value = '' })

function addVetting () {
  if (!newVettingTypeId.value) return
  const dateEntered = dateToDateString(newDateEntered.value)
  const isDuplicate = vettings.value.some(v =>
    v.vettingTypeId === newVettingTypeId.value && v.dateEntered === dateEntered)
  if (isDuplicate) {
    duplicateVettingError.value = 'This vetting type and date is already on the list.'
    return
  }
  duplicateVettingError.value = ''
  const type = props.vettingTypeOptions.find(t => t.vettingTypeId === newVettingTypeId.value)
  const entry = {
    vettingTypeId: newVettingTypeId.value,
    name: type?.name,
    dateEntered,
    dateExpired: dateToDateString(newDateExpired.value),
  }
  vettings.value = [...vettings.value, entry]
  newVettingTypeId.value = null
  newDateEntered.value = null
  newDateExpired.value = null
}

function removeVetting (index) {
  const next = vettings.value.slice()
  next.splice(index, 1)
  vettings.value = next
}

function updateVettingDate (index, field, date) {
  const next = vettings.value.slice()
  next[index] = { ...next[index], [field]: dateToDateString(date) }
  vettings.value = next
}
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
      <label class="label" for="capabilities">
        Capabilities
        <i v-if="uncertain.selectedCapabilityIds" class="pi pi-exclamation-triangle uncertain-icon"
           v-tooltip.top="uncertainText('selectedCapabilityIds')" />
      </label>
      <MultiSelect id="capabilities" v-model="selectedCapabilityIds"
                   :options="capabilityOptions" optionLabel="name" optionValue="capabilityId"
                   display="chip" placeholder="Select capabilities" class="w-full" />
    </div>

    <div class="form-field span-4">
      <label class="label" for="volunteerNotes">Notes</label>
      <Textarea id="volunteerNotes" v-model="notes"
                rows="4" class="w-full" />
    </div>

    <div class="form-field ">
      <label class="label" for="associateVillages">
        Associate Villages
        <i v-if="uncertain.associateVillageIds" class="pi pi-exclamation-triangle uncertain-icon"
           v-tooltip.top="uncertainText('associateVillageIds')" />
      </label>
      <MultiSelect id="associateVillages" v-model="selectedAssociateVillageIds"
                   :options="villageOptions" optionLabel="name" optionValue="villageId"
                   display="chip" placeholder="Select villages" class="w-full" />
    </div>

  </div>

  <div v-if="showVettings" class="section">
    <h3 class="section-header">Vettings</h3>
    <div class="form-field span-4">
      <DataTable :value="vettings" size="small">
        <Column field="name" header="Type"></Column>
        <Column header="Date Completed">
          <template #body="{ data, index }">
            <DatePicker :modelValue="dateStringToDate(data.dateEntered)"
                        @update:modelValue="updateVettingDate(index, 'dateEntered', $event)"
                        dateFormat="mm/dd/yy" placeholder="Select date" showIcon showButtonBar />
          </template>
        </Column>
        <Column header="Date Expired">
          <template #body="{ data, index }">
            <DatePicker :modelValue="dateStringToDate(data.dateExpired)"
                        @update:modelValue="updateVettingDate(index, 'dateExpired', $event)"
                        dateFormat="mm/dd/yy" placeholder="Select date" showIcon showButtonBar />
          </template>
        </Column>
        <Column header="">
          <template #body="{ index }">
            <Button type="button" icon="pi pi-trash" severity="danger" text
                    @click="removeVetting(index)" aria-label="Remove vetting" />
          </template>
        </Column>
        <template #empty>No vettings on record.</template>
      </DataTable>

      <div class="add-vetting-row">
        <Select v-model="newVettingTypeId" :options="vettingTypeOptions"
                optionLabel="name" optionValue="vettingTypeId"
                placeholder="Select vetting type" class="add-vetting-type" />
        <DatePicker v-model="newDateEntered" dateFormat="mm/dd/yy"
                    placeholder="Date Completed" showIcon showButtonBar />
        <DatePicker v-model="newDateExpired" dateFormat="mm/dd/yy"
                    placeholder="Date Expired" showIcon showButtonBar />
        <Button type="button" label="Add Vetting" icon="pi pi-plus"
                :disabled="!newVettingTypeId" @click="addVetting" />
      </div>
      <p v-if="duplicateVettingError" class="duplicate-vetting-error">{{ duplicateVettingError }}</p>
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
  border-bottom: 2px solid var(--color-border-default);
  padding-bottom: 0.75rem;
  margin: 0 0 0.75rem 0;
}
.section-header-row .section-header {
  border-bottom: none;
  padding-bottom: 0;
  margin: 0;
}
.form-field.span-4 { grid-column: 1 / -1; }
.add-vetting-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
}
.add-vetting-type { min-width: 14rem; }
.duplicate-vetting-error {
  color: var(--color-text-error);
  font-size: 0.85rem;
  margin: 0.5rem 0 0;
}

@media (max-width: 900px) {
  .section { grid-template-columns: 1fr 1fr; }
  .form-field.span-4 { grid-column: span 2; }
}
@media (max-width: 600px) {
  .section { grid-template-columns: 1fr; }
  .form-field.span-4 { grid-column: span 1; }
}
</style>
