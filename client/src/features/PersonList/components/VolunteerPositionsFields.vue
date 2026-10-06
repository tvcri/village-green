<script setup>
// Positions section of the volunteer editor (UI spec §6). The "where"
// choice follows the scope; village positions offer only the home and
// current associate villages. Rows a removed associate village no longer
// covers are marked; VolunteerEdit leaves them out on save.
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { scopeLabel, eligibleVillageIds, isPositionEligible, missingExpectedTrainings } from '../../../shared/lib/positionRules.js'

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

const chosen = ref(null) // position option
const where = ref(null) // { key, label, villageId } | { key, label, circleId }
const error = ref('')

const eligible = computed(() => eligibleVillageIds(props.homeVillage?.villageId, props.associateVillageIds))
const whereOptions = computed(() => {
  if (!chosen.value) return []
  if (chosen.value.scope === 'village') {
    return props.villageOptions.filter(v => eligible.value.includes(String(v.villageId)))
      .map(v => ({ key: `v${v.villageId}`, label: v.name, villageId: v.villageId }))
  }
  if (chosen.value.scope === 'circle') return props.circleOptions.map(c => ({ key: `c${c.circleId}`, label: c.name, circleId: c.circleId }))
  return []
})
const trainingName = (id) => props.trainingOptions.find(t => String(t.trainingId) === String(id))?.name ?? id
const optionFor = (row) => props.positionOptions.find(p => String(p.positionId) === String(row.positionId))
const lost = (row) => !isPositionEligible({ scope: row.scope, villageId: row.villageId }, props.homeVillage?.villageId, props.associateVillageIds)
const hint = (row) => missingExpectedTrainings(optionFor(row)?.trainingIds ?? [], props.trainings).map(trainingName)

function choose (option) { chosen.value = option; where.value = null; error.value = '' }
function addPosition () {
  const p = chosen.value
  const villageId = p.scope === 'village' ? where.value?.villageId ?? null : null
  const circleId = p.scope === 'circle' ? where.value?.circleId ?? null : null
  if (positions.value.some(r => r.positionId === p.positionId && (r.villageId ?? null) === villageId && (r.circleId ?? null) === circleId)) {
    error.value = `Already holds ${p.name}${where.value ? ` in ${where.value.label}` : ''}.`
    return
  }
  positions.value = [...positions.value, {
    positionId: p.positionId, name: p.name, scope: p.scope,
    villageId, villageName: p.scope === 'village' ? where.value.label : null,
    circleId, circleName: p.scope === 'circle' ? where.value.label : null,
  }]
  chosen.value = null
  where.value = null
  error.value = ''
}
function remove (i) { const next = positions.value.slice(); next.splice(i, 1); positions.value = next }
</script>

<template>
  <div class="section">
    <h3 class="section-header">Positions</h3>
    <table class="rows">
      <thead><tr><th>Position</th><th>Where</th><th>Expected training</th><th></th></tr></thead>
      <tbody>
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
        <tr v-if="!positions.length"><td colspan="4" class="dim">No positions.</td></tr>
      </tbody>
    </table>
    <div class="add-row">
      <span class="add-label">Position:</span>
      <Button v-for="o in positionOptions" :key="o.positionId" :label="`${o.name} (${scopeLabel(o.scope)})`" size="small"
              :outlined="chosen?.positionId !== o.positionId" :aria-label="`Choose ${o.name}`" @click="choose(o)" />
    </div>
    <div v-if="chosen" class="add-row">
      <template v-if="chosen.scope === 'federation'"><span class="dim">Hub-wide, no village</span></template>
      <template v-else>
        <span class="add-label">{{ chosen.scope === 'village' ? 'Village:' : 'Circle:' }}</span>
        <Button v-for="w in whereOptions" :key="w.key" data-testid="where-option" :label="w.label" size="small"
                :outlined="where?.key !== w.key" @click="where = w" />
      </template>
      <Button label="Add Position" icon="pi pi-plus" :disabled="chosen.scope !== 'federation' && !where" @click="addPosition" />
    </div>
    <small v-if="chosen?.scope === 'village'" class="dim">
      Only {{ homeVillage?.name ? `${homeVillage.name} (home) and` : '' }} this volunteer’s associate villages are offered. To hold it elsewhere,
      add that village under Associate Villages first; the list updates immediately.
    </small>
    <small v-if="chosen && hint({ positionId: chosen.positionId }).length" class="hint">
      No record of {{ hint({ positionId: chosen.positionId }).join(', ') }}
    </small>
    <small v-if="error" class="error">{{ error }}</small>
  </div>
</template>

<style scoped src="./formFields.css"></style>
<style scoped>
.rows { width: 100%; border-collapse: collapse; grid-column: 1 / -1; }
.rows th, .rows td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--color-border-default); }
.removing td { color: var(--color-text-dim); }
.removing td:first-child { text-decoration: line-through; }
.why { font-size: 0.8rem; color: var(--color-text-error); }
.hint { display: inline-block; font-size: 0.8rem; color: var(--color-text-error); margin-right: 0.4rem; }
.add-row { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.add-label { color: var(--color-text-dim); font-size: 0.85rem; }
.error { grid-column: 1 / -1; color: var(--color-text-error); }
.dim { color: var(--color-text-dim); }
small.dim, small.hint { grid-column: 1 / -1; }
</style>
