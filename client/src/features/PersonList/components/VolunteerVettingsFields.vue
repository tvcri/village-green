<script setup>
// Vettings section of the volunteer editor. New rows are added the way
// GrantsEditor adds grants (and as VolunteerTrainingsFields does): a pending
// row at the top of the table, committed with ✓. `adding` tells the parent a
// pending row is open, since it is not in the model until committed.
import { ref } from 'vue'
import DatePicker from 'primevue/datepicker'
import Select from 'primevue/select'
import Button from 'primevue/button'
import { serviceDateToDate, dateToServiceDate } from '../../../shared/lib/civilDate.js'

const props = defineProps({ vettingTypeOptions: { type: Array, required: true } })
// Rows: { key, vettingTypeId, name, dateEntered, dateExpired, additionalData?, notes? }.
// `key` is a stable row identity, set at load or add; it is never sent.
const vettings = defineModel('vettings', { type: Array, required: true })
const adding = defineModel('adding', { type: Boolean, default: false })

let seq = 0
const newKey = () => `new${++seq}`

const pending = ref(null) // { vettingTypeId, dateEntered, dateExpired }
const error = ref('')

function update (index, field, value) {
  const next = vettings.value.slice()
  next[index] = { ...next[index], [field]: value }
  vettings.value = next
}
function remove (index) {
  const next = vettings.value.slice()
  next.splice(index, 1)
  vettings.value = next
}
function open () {
  error.value = ''
  pending.value = { vettingTypeId: null, dateEntered: null, dateExpired: null }
  adding.value = true
}
function cancel () {
  error.value = ''
  pending.value = null
  adding.value = false
}
function save () {
  const type = props.vettingTypeOptions.find(t => t.vettingTypeId === pending.value.vettingTypeId)
  if (!type) return
  const { dateEntered, dateExpired } = pending.value
  if (vettings.value.some(v => v.vettingTypeId === type.vettingTypeId && v.dateEntered === dateEntered)) {
    error.value = 'This vetting type and date is already on the list.'
    return
  }
  vettings.value = [...vettings.value, { key: newKey(), vettingTypeId: type.vettingTypeId, name: type.name, dateEntered, dateExpired }]
  cancel()
}
</script>

<template>
  <div class="section">
    <div class="section-head">
      <h3 class="section-header">Vettings</h3>
      <Button label="Add Vetting" icon="pi pi-plus" size="small" :disabled="!!pending" @click="open" />
    </div>
    <div class="table-wrap">
      <table class="rows">
        <thead><tr><th>Type</th><th>Date completed</th><th>Date expired</th><th class="actions-col"></th></tr></thead>
        <tbody>
          <tr v-if="pending" class="pending">
            <td>
              <Select v-model="pending.vettingTypeId" :options="props.vettingTypeOptions" optionLabel="name" optionValue="vettingTypeId"
                      placeholder="-- Type --" ariaLabel="New vetting type" class="w-full" @change="error = ''" />
            </td>
            <td>
              <DatePicker :modelValue="serviceDateToDate(pending.dateEntered)" dateFormat="mm/dd/yy" showIcon showButtonBar
                          placeholder="Date completed" ariaLabel="New vetting date completed"
                          @update:modelValue="d => { pending.dateEntered = dateToServiceDate(d); error = '' }" />
            </td>
            <td>
              <DatePicker :modelValue="serviceDateToDate(pending.dateExpired)" dateFormat="mm/dd/yy" showIcon showButtonBar
                          placeholder="Date expired" ariaLabel="New vetting date expired"
                          @update:modelValue="d => { pending.dateExpired = dateToServiceDate(d) }" />
            </td>
            <td>
              <div class="row-actions">
                <Button icon="pi pi-check" severity="success" size="small" :disabled="pending.vettingTypeId == null"
                        aria-label="Save new vetting" title="Add vetting" @click="save" />
                <Button icon="pi pi-times" severity="secondary" size="small" aria-label="Cancel new vetting" title="Cancel" @click="cancel" />
              </div>
            </td>
          </tr>
          <tr v-for="(v, i) in vettings" :key="v.key ?? `i${i}`">
            <td data-testid="vetting-name">{{ v.name }}</td>
            <td>
              <DatePicker :modelValue="serviceDateToDate(v.dateEntered)" dateFormat="mm/dd/yy" showIcon showButtonBar
                          placeholder="No date" @update:modelValue="d => update(i, 'dateEntered', dateToServiceDate(d))" />
            </td>
            <td>
              <DatePicker :modelValue="serviceDateToDate(v.dateExpired)" dateFormat="mm/dd/yy" showIcon showButtonBar
                          placeholder="No date" @update:modelValue="d => update(i, 'dateExpired', dateToServiceDate(d))" />
            </td>
            <td><Button icon="pi pi-trash" text rounded severity="danger" :aria-label="`Remove ${v.name}`" @click="remove(i)" /></td>
          </tr>
          <tr v-if="!vettings.length && !pending"><td colspan="4" class="dim">No vettings on record.</td></tr>
        </tbody>
      </table>
    </div>
    <small v-if="error" class="error">{{ error }}</small>
  </div>
</template>

<style scoped src="./formFields.css"></style>
<style scoped src="./rowTable.css"></style>
<style scoped>
.error { grid-column: 1 / -1; color: var(--color-text-error); }
.dim { color: var(--color-text-dim); }
</style>
