<script setup>
// Trainings section of the volunteer editor (UI spec §6). One row per
// completion; the only place an undated record can be created.
import { ref, computed } from 'vue'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
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

let seq = 0
const newKey = () => `new${++seq}`

const newDate = ref(null) // 'YYYY-MM-DD' or null
const newNotes = ref('')
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
function add (option) {
  error.value = ''
  const date = newDate.value
  if (clashes(option.trainingId, date)) {
    error.value = clashMessage(option.name, date)
    return
  }
  trainings.value = [...trainings.value, {
    key: newKey(), sortDate: date, trainingId: option.trainingId, name: option.name, completedDate: date, notes: newNotes.value.trim() || null,
  }]
  newDate.value = null
  newNotes.value = ''
}
</script>

<template>
  <div class="section">
    <h3 class="section-header">Trainings</h3>
    <table class="rows">
      <thead><tr><th>Training</th><th>Date completed</th><th>Notes</th><th></th></tr></thead>
      <tbody>
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
        <tr v-if="!sorted.length"><td colspan="4" class="dim">No trainings on record.</td></tr>
      </tbody>
    </table>
    <div class="add-row">
      <DatePicker :modelValue="serviceDateToDate(newDate)" dateFormat="mm/dd/yy" showIcon showButtonBar placeholder="Date completed (optional)"
                  @update:modelValue="d => { newDate = dateToServiceDate(d) }" />
      <InputText v-model="newNotes" placeholder="Notes (optional)" aria-label="New training notes" />
      <span class="add-label">Add:</span>
      <Button v-for="o in props.trainingOptions" :key="o.trainingId" :label="o.name" icon="pi pi-plus" size="small" outlined
              :aria-label="`Add ${o.name}`" @click="add(o)" />
    </div>
    <small v-if="error" class="error">{{ error }}</small>
    <small class="dim">One row per completion: a refresher is a second row. Leaving the date empty records an undated completion (at most one per training).</small>
  </div>
</template>

<style scoped src="./formFields.css"></style>
<style scoped>
.rows { width: 100%; border-collapse: collapse; grid-column: 1 / -1; }
.rows th, .rows td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--color-border-default); }
.add-row { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.add-label { color: var(--color-text-dim); font-size: 0.85rem; }
.error { grid-column: 1 / -1; color: var(--color-text-error); }
.dim { grid-column: 1 / -1; color: var(--color-text-dim); }
</style>
