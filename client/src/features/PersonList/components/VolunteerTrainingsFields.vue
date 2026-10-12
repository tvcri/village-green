<script setup>
// Trainings section of the volunteer editor (UI spec §6). One row per
// completion; the only place an undated record can be created. New rows are
// added the way GrantsEditor adds grants: a pending row at the top of the
// table, committed with ✓. `adding` tells the parent a pending row is open,
// since it is not in the model until committed.
import { ref, computed } from 'vue'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import { serviceDateToDate, dateToServiceDate, formatCivilDate } from '../../../shared/lib/civilDate.js'

const props = defineProps({ trainingOptions: { type: Array, required: true } })
// Rows: { key, sortDate, trainingId, name, completedDate, notes }. `key` is a
// stable row identity and `sortDate` the date the row is ordered by. Both are
// set when the row is loaded or added and left alone on edit: a DatePicker
// writes on every keystroke that parses ('05/12/2' is a date), so keying or
// sorting on completedDate would remount and move the row mid-typing. Neither
// is sent to the API. Rows without them fall back to index / completedDate.
const trainings = defineModel('trainings', { type: Array, required: true })
const adding = defineModel('adding', { type: Boolean, default: false })

let seq = 0
const newKey = () => `new${++seq}`

const pending = ref(null) // { trainingId, completedDate: 'YYYY-MM-DD' | null, notes }
const error = ref('')

// By name, then newest first; the undated record (if any) sorts last.
const sortDateOf = (t) => (t.sortDate !== undefined ? t.sortDate : t.completedDate) ?? ''
const sorted = computed(() => trainings.value
  .map((t, index) => ({ ...t, index, rowKey: t.key ?? `i${index}` }))
  .sort((a, b) => a.name.localeCompare(b.name) || sortDateOf(b).localeCompare(sortDateOf(a))))

// The server 422s on a duplicate (trainingId, completedDate), so the form
// refuses one rather than letting Save fail.
function clashMessage (name, date) {
  return date
    ? `${name} is already recorded for ${formatCivilDate(date)}.`
    : `${name} already has an undated record. Give this one a date.`
}
function clashes (trainingId, date, exceptIndex = -1) {
  return trainings.value.some((t, i) => i !== exceptIndex && t.trainingId === trainingId && (t.completedDate ?? null) === date)
}

function update (index, field, value) {
  error.value = ''
  const row = trainings.value[index]
  if (field === 'completedDate' && clashes(row.trainingId, value, index)) {
    error.value = clashMessage(row.name, value)
    return
  }
  const next = trainings.value.slice()
  next[index] = { ...row, [field]: value }
  trainings.value = next
}
function remove (index) {
  error.value = ''
  const next = trainings.value.slice()
  next.splice(index, 1)
  trainings.value = next
}
function open () {
  error.value = ''
  pending.value = { trainingId: null, completedDate: null, notes: '' }
  adding.value = true
}
function cancel () {
  error.value = ''
  pending.value = null
  adding.value = false
}
function save () {
  const option = props.trainingOptions.find(o => o.trainingId === pending.value.trainingId)
  if (!option) return
  const date = pending.value.completedDate
  if (clashes(option.trainingId, date)) {
    error.value = clashMessage(option.name, date)
    return
  }
  trainings.value = [...trainings.value, {
    key: newKey(), sortDate: date, trainingId: option.trainingId, name: option.name, completedDate: date, notes: pending.value.notes.trim() || null,
  }]
  cancel()
}
</script>

<template>
  <div class="section">
    <div class="section-head">
      <h3 class="section-header">Trainings</h3>
      <Button label="Add Training" icon="pi pi-plus" size="small" :disabled="!!pending" @click="open" />
    </div>
    <div class="table-wrap">
      <table class="rows">
        <thead><tr><th>Training</th><th>Date completed</th><th>Notes</th><th class="actions-col"></th></tr></thead>
        <tbody>
          <tr v-if="pending" class="pending">
            <td>
              <Select v-model="pending.trainingId" :options="props.trainingOptions" optionLabel="name" optionValue="trainingId"
                      placeholder="-- Training --" ariaLabel="New training" class="w-full" @change="error = ''" />
            </td>
            <td>
              <DatePicker :modelValue="serviceDateToDate(pending.completedDate)" dateFormat="mm/dd/yy" showIcon showButtonBar
                          placeholder="Date (optional)" ariaLabel="New training date"
                          @update:modelValue="d => { pending.completedDate = dateToServiceDate(d); error = '' }" />
            </td>
            <td><InputText v-model="pending.notes" placeholder="Notes (optional)" aria-label="New training notes" class="w-full" /></td>
            <td>
              <div class="row-actions">
                <Button icon="pi pi-check" severity="success" size="small" :disabled="pending.trainingId == null"
                        aria-label="Save new training" title="Add training" @click="save" />
                <Button icon="pi pi-times" severity="secondary" size="small" aria-label="Cancel new training" title="Cancel" @click="cancel" />
              </div>
            </td>
          </tr>
          <tr v-for="t in sorted" :key="t.rowKey">
            <td data-testid="training-name">{{ t.name }}</td>
            <td>
              <DatePicker :modelValue="serviceDateToDate(t.completedDate)" dateFormat="mm/dd/yy" showIcon showButtonBar
                          placeholder="No date" @update:modelValue="d => update(t.index, 'completedDate', dateToServiceDate(d))" />
            </td>
            <td><InputText :modelValue="t.notes ?? ''" class="w-full" :aria-label="`Notes for ${t.name}`"
                           @update:modelValue="v => update(t.index, 'notes', v || null)" /></td>
            <td><Button icon="pi pi-trash" text rounded severity="danger" :aria-label="`Remove ${t.name}`" @click="remove(t.index)" /></td>
          </tr>
          <tr v-if="!sorted.length && !pending"><td colspan="4" class="dim">No trainings on record.</td></tr>
        </tbody>
      </table>
    </div>
    <small v-if="error" class="error">{{ error }}</small>
    <small v-if="pending" class="dim">One row per completion: a refresher is a second row. Leave the date empty for an undated completion (at most one per training).</small>
  </div>
</template>

<style scoped src="./formFields.css"></style>
<style scoped src="./rowTable.css"></style>
<style scoped>
.error { grid-column: 1 / -1; color: var(--color-text-error); }
.dim { grid-column: 1 / -1; color: var(--color-text-dim); }
</style>
