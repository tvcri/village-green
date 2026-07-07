<script setup>
import { ref } from 'vue'
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import Textarea from 'primevue/textarea'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'

const props = defineProps({
  providerType: { type: String, default: '' },
  active: { type: Boolean, default: true },
  notes: { type: String, default: '' },
  selectedCapabilityIds: { type: Array, required: true },
  selectedAssociateVillageIds: { type: Array, required: true },
  capabilityOptions: { type: Array, required: true },
  villageOptions: { type: Array, required: true },
  vettingTypeOptions: { type: Array, default: () => [] },
  vettings: { type: Array, default: () => [] },
  showVettings: { type: Boolean, default: false },
  uncertain: { type: Object, default: () => ({}) },
})
const emit = defineEmits([
  'update:providerType', 'update:active', 'update:notes',
  'update:selectedCapabilityIds', 'update:selectedAssociateVillageIds',
  'update:vettings',
])

const providerTypeOptions = [
  'Non-member Volunteer',
  'Member Volunteer',
].map(t => ({ label: t, value: t }))

function uncertainText (field) {
  const u = props.uncertain[field]
  return u?.alternative ? `${u.reason} — alternative: ${u.alternative}` : u?.reason
}

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

function addVetting () {
  if (!newVettingTypeId.value) return
  const type = props.vettingTypeOptions.find(t => t.vettingTypeId === newVettingTypeId.value)
  const entry = {
    vettingTypeId: newVettingTypeId.value,
    name: type?.name,
    dateEntered: dateToDateString(newDateEntered.value),
    dateExpired: dateToDateString(newDateExpired.value),
  }
  emit('update:vettings', [...props.vettings, entry])
  newVettingTypeId.value = null
  newDateEntered.value = null
  newDateExpired.value = null
}

function removeVetting (index) {
  const next = props.vettings.slice()
  next.splice(index, 1)
  emit('update:vettings', next)
}

function updateVettingDate (index, field, date) {
  const next = props.vettings.slice()
  next[index] = { ...next[index], [field]: dateToDateString(date) }
  emit('update:vettings', next)
}
</script>

<template>
  <div class="section">
    <div class="section-header-row">
      <h3 class="section-header">Provider</h3>
      <label class="checkbox-item">
        <Checkbox :modelValue="active" @update:modelValue="$emit('update:active', $event)" binary />
        <span class="checkbox-label">Active</span>
      </label>
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

    <div class="form-field ">
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
.checkbox-item { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
.checkbox-label { font-size: 1rem; color: var(--color-text-primary); }
.uncertain-icon { color: var(--p-amber-500, #f59e0b); margin-left: 0.35rem; cursor: help; }
.add-vetting-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
}
.add-vetting-type { min-width: 14rem; }

@media (max-width: 900px) {
  .section { grid-template-columns: 1fr 1fr; }
  .form-field.span-2, .form-field.span-4 { grid-column: span 2; }
}
@media (max-width: 600px) {
  .section { grid-template-columns: 1fr; }
  .form-field.span-2, .form-field.span-4 { grid-column: span 1; }
}
</style>
