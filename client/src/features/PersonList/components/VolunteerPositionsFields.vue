<script setup>
// Positions section of the volunteer editor (UI spec §6). New rows are added
// the way GrantsEditor adds grants: a pending row at the top of the table,
// committed with ✓. The "where" choice follows the scope; village positions
// offer only the home and current associate villages. A combination already
// held is left out of the choices rather than refused after the fact. Rows a
// removed associate village no longer covers are marked; VolunteerEdit leaves
// them out on save. `adding` tells the parent a pending row is open.
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { SCOPE_LABELS, scopeLabel, eligibleVillageIds, isPositionEligible, missingExpectedTrainings } from '../../../shared/lib/positionRules.js'

const props = defineProps({
  positionOptions: { type: Array, required: true },
  homeVillage: { type: Object, default: null },
  associateVillageIds: { type: Array, required: true },
  villageOptions: { type: Array, required: true },
  circleOptions: { type: Array, required: true },
  trainings: { type: Array, required: true },
  trainingOptions: { type: Array, required: true },
})
const positions = defineModel('positions', { type: Array, required: true })
const adding = defineModel('adding', { type: Boolean, default: false })

const pending = ref(null) // { positionId, whereKey }

const str = (v) => (v === null || v === undefined ? '' : String(v))
const eligible = computed(() => eligibleVillageIds(props.homeVillage?.villageId, props.associateVillageIds))

// Every place a position could be held, minus the ones this volunteer
// already holds it in. A Hub position has one place: the Hub itself.
function whereChoices (option) {
  const held = new Set(positions.value
    .filter(r => str(r.positionId) === str(option.positionId))
    .map(r => `${str(r.villageId)}|${str(r.circleId)}`))
  let choices = [{ key: '|', label: 'Hub' }]
  if (option.scope === 'village') {
    choices = props.villageOptions.filter(v => eligible.value.includes(str(v.villageId))).map(v => ({
      key: `${str(v.villageId)}|`, villageId: v.villageId, name: v.name,
      label: `${v.name} (${str(v.villageId) === str(props.homeVillage?.villageId) ? 'home' : 'associate'})`,
    }))
  }
  else if (option.scope === 'circle') {
    choices = props.circleOptions.map(c => ({ key: `|${str(c.circleId)}`, circleId: c.circleId, name: c.name, label: c.name }))
  }
  return choices.filter(w => !held.has(w.key))
}

// Grouped for the Select: Hub, then Village, then Circle; empty groups dropped.
const positionGroups = computed(() => Object.keys(SCOPE_LABELS)
  .map(scope => ({ label: scopeLabel(scope), items: props.positionOptions.filter(p => p.scope === scope && whereChoices(p).length) }))
  .filter(g => g.items.length))

// Shade the Hub/Village/Circle headers and indent the positions under them.
// A token override, not scoped CSS: the option list renders in an overlay
// attached to <body>, outside this component's styles. Option padding is the
// Material preset's 0.75rem 1rem with the left side doubled.
const groupedSelectTokens = {
  option: { padding: '0.75rem 1rem 0.75rem 2rem' },
  optionGroup: { background: '{surface.100}' },
  colorScheme: { dark: { optionGroup: { background: '{surface.800}' } } },
}

const chosen = computed(() => props.positionOptions.find(p => str(p.positionId) === str(pending.value?.positionId)) ?? null)
const whereOptions = computed(() => (chosen.value ? whereChoices(chosen.value) : []))
const where = computed(() => whereOptions.value.find(w => w.key === pending.value?.whereKey) ?? null)
const whereLabel = computed(() => (chosen.value?.scope === 'circle' ? 'Circle' : 'Village'))
const canSave = computed(() => !!chosen.value && (chosen.value.scope === 'federation' || !!where.value))

const trainingName = (id) => props.trainingOptions.find(t => String(t.trainingId) === String(id))?.name ?? id
const optionFor = (row) => props.positionOptions.find(p => String(p.positionId) === String(row.positionId))
const lost = (row) => !isPositionEligible({ scope: row.scope, villageId: row.villageId }, props.homeVillage?.villageId, props.associateVillageIds)
const hint = (row) => missingExpectedTrainings(optionFor(row)?.trainingIds ?? [], props.trainings).map(trainingName)

function open () { pending.value = { positionId: null, whereKey: null }; adding.value = true }
function cancel () { pending.value = null; adding.value = false }
// Places are position-specific: changing the position invalidates the place.
function onPositionChange () { pending.value.whereKey = null }
function save () {
  if (!canSave.value) return
  const p = chosen.value
  const w = where.value
  positions.value = [...positions.value, {
    positionId: p.positionId, name: p.name, scope: p.scope,
    villageId: p.scope === 'village' ? w.villageId : null, villageName: p.scope === 'village' ? w.name : null,
    circleId: p.scope === 'circle' ? w.circleId : null, circleName: p.scope === 'circle' ? w.name : null,
  }]
  cancel()
}
function remove (i) { const next = positions.value.slice(); next.splice(i, 1); positions.value = next }
</script>

<template>
  <div class="section">
    <div class="section-head">
      <h3 class="section-header">Positions</h3>
      <Button label="Add Position" icon="pi pi-plus" size="small" :disabled="!!pending" @click="open" />
    </div>
    <div class="table-wrap">
      <table class="rows">
        <thead><tr><th>Position</th><th>Where</th><th>Expected training</th><th class="actions-col"></th></tr></thead>
        <tbody>
          <tr v-if="pending" class="pending">
            <td>
              <Select v-model="pending.positionId" :options="positionGroups" optionLabel="name" optionValue="positionId"
                      optionGroupLabel="label" optionGroupChildren="items" placeholder="-- Position --"
                      filter filterMatchMode="contains" filterPlaceholder="Type to find a position" resetFilterOnHide autoFilterFocus
                      scrollHeight="24rem" ariaLabel="New position" class="w-full" :dt="groupedSelectTokens" @change="onPositionChange" />
            </td>
            <td>
              <template v-if="chosen?.scope === 'federation'">Hub</template>
              <Select v-else v-model="pending.whereKey" :options="whereOptions" optionLabel="label" optionValue="key"
                      :placeholder="`-- ${whereLabel} --`" :ariaLabel="whereLabel" :disabled="!chosen" class="w-full" />
            </td>
            <td>
              <template v-if="chosen">
                <span v-for="m in hint({ positionId: chosen.positionId })" :key="m" class="hint">No record of {{ m }}</span>
              </template>
            </td>
            <td>
              <div class="row-actions">
                <Button icon="pi pi-check" severity="success" size="small" :disabled="!canSave"
                        aria-label="Save new position" title="Add position" @click="save" />
                <Button icon="pi pi-times" severity="secondary" size="small" aria-label="Cancel new position" title="Cancel" @click="cancel" />
              </div>
            </td>
          </tr>
          <tr v-for="(r, i) in positions" :key="`${r.positionId}|${r.villageId}|${r.circleId}`" :class="{ removing: lost(r) }">
            <td>{{ r.name }} <Tag :value="scopeLabel(r.scope)" severity="secondary" /></td>
            <td>
              {{ r.villageName ?? r.circleName ?? 'Hub' }}
              <div v-if="lost(r)" class="why">Will be removed on save: {{ r.villageName }} is no longer one of this volunteer’s villages.</div>
            </td>
            <td>
              <template v-if="!lost(r)">
                <span v-for="m in hint(r)" :key="m" class="hint">No record of {{ m }}</span>
                <span v-if="!hint(r).length" class="dim">—</span>
              </template>
            </td>
            <td><Button icon="pi pi-trash" text rounded severity="danger" :aria-label="`Remove ${r.name}`" @click="remove(i)" /></td>
          </tr>
          <tr v-if="!positions.length && !pending"><td colspan="4" class="dim">No positions.</td></tr>
        </tbody>
      </table>
    </div>
    <small v-if="chosen?.scope === 'village'" class="dim">
      Only {{ homeVillage?.name ? `${homeVillage.name} (home) and` : '' }} this volunteer’s associate villages are offered, less any where
      the position is already held. To hold it elsewhere, add that village under Associate Villages first; the list updates immediately.
    </small>
  </div>
</template>

<style scoped src="./formFields.css"></style>
<style scoped src="./rowTable.css"></style>
<style scoped>
.removing td { color: var(--color-text-dim); }
.removing td:first-child { text-decoration: line-through; }
.why { font-size: 0.8rem; color: var(--color-text-error); }
.hint { display: inline-block; font-size: 0.8rem; color: var(--color-text-error); margin-right: 0.4rem; }
.dim { color: var(--color-text-dim); }
small.dim { grid-column: 1 / -1; }
</style>
