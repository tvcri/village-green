<script setup>
// The record-completions panel on a training's page (UI spec §4): one date
// and note for the batch, optional "also assign", staged New rows, one save.
import { ref, computed, watch } from 'vue'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import RadioButton from 'primevue/radiobutton'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import VolunteerSearch from '../../../shared/components/VolunteerSearch.vue'
import { getPositionHolders } from '../../Positions/api/positionApi.js'
import { recordTrainingCompletions } from '../api/trainingApi.js'
import { serviceDateToDate, dateToServiceDate, todayCivilDate } from '../../../shared/lib/civilDate.js'
import { scopeLabel } from '../../../shared/lib/positionRules.js'
import { trainingFlag, positionFlag, batchSummary, resultMessage } from '../lib/completionFlags.js'

const props = defineProps({
  training: { type: Object, required: true },
  linkedPositions: { type: Array, default: () => [] }, // circle positions already filtered out
  completions: { type: Array, required: true },
  roster: { type: Array, required: true },
})
const emit = defineEmits(['saved', 'close'])
const dirty = defineModel('dirty', { type: Boolean, default: false })

const date = ref(todayCivilDate())
const notes = ref('')
const positionId = ref('')
const holders = ref([])
const attendeeIds = ref([])
const saving = ref(false)
const error = ref('')

const position = computed(() => props.linkedPositions.find(p => p.positionId === positionId.value) ?? null)
watch(positionId, async (id) => { holders.value = id ? await getPositionHolders(id) : [] })
watch(attendeeIds, (ids) => { dirty.value = ids.length > 0 }, { deep: true })

const attendees = computed(() => attendeeIds.value.map(id => props.roster.find(p => p.personId === id)).filter(Boolean))
const flags = computed(() => attendees.value.map(p => ({
  person: p,
  training: trainingFlag(p.personId, props.completions, date.value),
  position: positionFlag(p, position.value, holders.value),
})))
const summary = computed(() => batchSummary(flags.value))

function status (p) {
  return attendeeIds.value.includes(p.personId) ? { disabled: true, reason: 'Already in this batch' } : { disabled: false, reason: null }
}
function meta (p) {
  return `${p.village?.name ?? 'Hub volunteer'} · ${p.active ? 'Active' : 'Inactive'} · ${trainingFlag(p.personId, props.completions, null).text}`
}
function add (p) { attendeeIds.value = [...attendeeIds.value, p.personId] }
function drop (personId) { attendeeIds.value = attendeeIds.value.filter(id => id !== personId) }

function close () {
  dirty.value = false
  attendeeIds.value = []
  emit('close')
}

async function save () {
  error.value = ''
  saving.value = true
  const personIds = [...attendeeIds.value]
  try {
    const result = await recordTrainingCompletions(props.training.trainingId, {
      completedDate: date.value, notes: notes.value.trim() || null, personIds, positionId: positionId.value || null,
    })
    const message = resultMessage({ trainingName: props.training.name, date: date.value, positionName: position.value?.name, result })
    dirty.value = false
    attendeeIds.value = []
    emit('saved', { result, date: date.value, message })
  }
  catch (err) {
    error.value = err?.body?.error ?? 'Failed to record completions.'
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="record-panel">
    <h2>Record completions</h2>
    <div class="grid2">
      <div class="field">
        <label for="completed-date">Date completed</label>
        <DatePicker inputId="completed-date" :modelValue="serviceDateToDate(date)" dateFormat="mm/dd/yy" showIcon
                    @update:modelValue="d => { date = dateToServiceDate(d) }" />
        <small class="help">Required. Applies to everyone you add.</small>
      </div>
      <div class="field">
        <label for="completion-notes">Notes (optional)</label>
        <InputText id="completion-notes" v-model="notes" maxlength="500" placeholder="For example: email from Gabriella" />
        <small class="help">Saved on every new record.</small>
      </div>
    </div>

    <fieldset v-if="linkedPositions.length" class="field assign">
      <legend>Also assign a position (optional)</legend>
      <label class="radio"><RadioButton v-model="positionId" value="" inputId="assign-none" /> Don’t assign a position</label>
      <label v-for="p in linkedPositions" :key="p.positionId" class="radio">
        <RadioButton v-model="positionId" :value="p.positionId" :inputId="`assign-${p.positionId}`" />
        {{ p.name }} ({{ scopeLabel(p.scope) }})
      </label>
      <small class="help">
        {{ training.name }} leads to {{ linkedPositions.map(p => p.name).join(' and ') }}.
        {{ position?.scope === 'village'
          ? 'Each volunteer is assigned in their home village. To assign in an associate village, use the position’s page or the volunteer’s form.'
          : 'Volunteers who already hold it are left as they are.' }}
      </small>
    </fieldset>

    <VolunteerSearch :candidates="roster" :status="status" :meta="meta" input-id="record-search" @select="add" />

    <table v-if="flags.length" class="staged">
      <thead>
        <tr><th>Volunteer</th><th>Village</th><th>Status</th><th>This training</th><th v-if="position">{{ position.name }}</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="f in flags" :key="f.person.personId" class="adding">
          <td>{{ f.person.fullName }} <Tag value="New" severity="info" /></td>
          <td>{{ f.person.village?.name ?? 'Hub volunteer' }}</td>
          <td>{{ f.person.active ? 'Active' : 'Inactive' }}</td>
          <td><span :class="['flag', f.training.kind]">{{ f.training.text }}</span></td>
          <td v-if="position"><span :class="['flag', f.position.kind]">{{ f.position.text }}</span></td>
          <td><Button icon="pi pi-times" text rounded :aria-label="`Don’t add ${f.person.displayName}`" @click="drop(f.person.personId)" /></td>
        </tr>
      </tbody>
    </table>
    <p v-else class="help">People you add appear here, above the existing records, until you save.</p>
    <small v-if="error" class="error">{{ error }}</small>

    <div class="form-footer">
      <span class="summary">
        <template v-if="flags.length">
          {{ summary.toSave }} {{ summary.toSave === 1 ? 'record' : 'records' }} to save<template v-if="summary.skipped">, {{ summary.skipped }} already recorded</template><template v-if="position">; {{ summary.toAssign }} to assign as {{ position.name }}</template>
        </template>
        <template v-else>Add at least one volunteer</template>
      </span>
      <Button :label="flags.length ? 'Discard' : 'Close'" severity="secondary" :disabled="saving" @click="close" />
      <Button label="Save" :loading="saving" :disabled="!date || !(summary.toSave || summary.toAssign)" @click="save" />
    </div>
  </section>
</template>

<style scoped>
.record-panel { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; border: 1px solid var(--color-panel-border);
  border-radius: 6px; background: var(--color-panel-bg); }
h2 { margin: 0; font-size: 1.1rem; }
.grid2 { display: grid; grid-template-columns: 14rem 1fr; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
.field label, legend { font-size: 0.85rem; font-weight: 600; color: var(--color-text-dim); }
fieldset.assign { border: none; padding: 0; margin: 0; }
.radio { display: flex; align-items: center; gap: 0.5rem; }
.help { color: var(--color-text-dim); }
.error { color: var(--color-text-error); }
.staged { width: 100%; border-collapse: collapse; }
.staged th, .staged td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--color-border-default); }
.adding td { background: var(--p-primary-50); }
.flag.skip { color: var(--color-text-error); }
.flag.prior { color: var(--color-text-dim); }
/* Pinned to the bottom of the viewport while the page scrolls (UI spec §8).
   No ancestor of this element may set overflow hidden/auto. */
.form-footer { position: sticky; bottom: 0; z-index: 2; display: flex; justify-content: flex-end; align-items: center; gap: 0.5rem;
  padding: 0.75rem 0; background: var(--color-panel-bg); border-top: 1px solid var(--color-border-default); flex-wrap: wrap; }
.summary { margin-right: auto; font-size: 0.9rem; }
@media (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } }
</style>
