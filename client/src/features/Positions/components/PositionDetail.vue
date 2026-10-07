<script setup>
// One position's page (UI spec §5): holders by group; add and remove in
// place, staged until one save.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import HolderGroup from './HolderGroup.vue'
import ExportButton from '../../../components/ExportButton.vue'
import { getPositions, getPositionHolders, patchPositionHolders } from '../api/positionApi.js'
import { getTrainings, getTrainingCompletions } from '../../Trainings/api/trainingApi.js'
import { getVolunteerRoster } from '../../VolunteerList/api/volunteerApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { getCircles } from '../../PersonList/api/personApi.js'
import { holderGroups, candidateStatus, buildHoldersPatch } from '../lib/holderStaging.js'
import { scopeLabel, positionPlace } from '../../../shared/lib/positionRules.js'
import { formatCivilDate } from '../../../shared/lib/civilDate.js'
import { personExportColumns } from '../../../shared/lib/personExport.js'
import { withPersonDetail, exportSlug } from '../../PersonList/lib/personDetailExport.js'
import { useExportActions } from '../../../shared/composables/useExportActions.js'
import { useCurrentUser } from '../../../shared/composables/useCurrentUser.js'
import { useUnsavedChangesGuard } from '../../../shared/composables/useUnsavedChangesGuard.js'

const route = useRoute()
const toast = useToast()
const { hasPermission } = useCurrentUser()
const canWrite = computed(() => hasPermission('volunteer:write'))
const positionId = computed(() => route.params.positionId)

const position = ref(null)
const holders = ref([])
const villages = ref([])
const circles = ref([])
const roster = ref([])
const trainingNames = ref(new Map())
const latestByTraining = ref(new Map()) // trainingId -> Map(personId -> latest date or '')
const adds = ref([])
const removeIds = ref(new Set())
const openKey = ref(null)
const villageFilter = ref(null)
const saving = ref(false)
const loaded = ref(false)
const flashIds = ref(new Set())
let flashTimer = null
onBeforeUnmount(() => clearTimeout(flashTimer))

const dirty = computed(() => adds.value.length > 0 || removeIds.value.size > 0)
useUnsavedChangesGuard(() => dirty.value)

onMounted(async () => {
  try {
    const [positions, trainings, vs, cs, hs] = await Promise.all([getPositions(), getTrainings(), getVillages(), getCircles(), getPositionHolders(positionId.value)])
    const pos = positions.find(p => p.positionId === positionId.value) ?? null
    const expected = pos?.trainingIds ?? []
    // The roster is a write-only extra: its failure must not hide the holders.
    const rosterP = canWrite.value
      ? getVolunteerRoster().catch(() => { toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load the volunteer list; adding holders is unavailable', life: 4000 }); return [] })
      : Promise.resolve([])
    const [lists, rs] = await Promise.all([Promise.all(expected.map(id => getTrainingCompletions(id))), rosterP])
    latestByTraining.value = new Map(expected.map((id, i) => {
      const m = new Map()
      for (const c of lists[i]) {
        const cur = m.get(c.person.personId)
        if (cur === undefined || (c.completedDate ?? '') > cur) m.set(c.person.personId, c.completedDate ?? '')
      }
      return [id, m]
    }))
    trainingNames.value = new Map(trainings.map(t => [t.trainingId, t.name]))
    villages.value = vs
    circles.value = cs
    roster.value = rs
    holders.value = hs
    position.value = pos
    loaded.value = true
  }
  catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load the position', life: 3000 })
  }
})

const groups = computed(() => position.value && loaded.value
  ? holderGroups({ position: position.value, holders: holders.value, villages: villages.value, circles: circles.value, adds: adds.value })
    .filter(g => !villageFilter.value || g.villageId === villageFilter.value)
  : [])

function hintFor (personId) {
  const missing = []
  const ok = []
  for (const id of position.value?.trainingIds ?? []) {
    const name = trainingNames.value.get(id)
    const d = latestByTraining.value.get(id)?.get(personId)
    if (d === undefined) missing.push(name)
    else ok.push(d ? `${name} · ${formatCivilDate(d)}` : `${name} · date not recorded`)
  }
  return { missing, ok }
}

// Download / Google Sheet: the saved holders only (group.rows), never staged
// adds, and a holder marked for removal still holds it until Save. On-screen
// group order, then name order. One column per expected training: the newest
// completed date (stored YYYY-MM-DD), "No date" when only undated records
// exist, blank when there is no record — the data behind the hints.
const exportColumns = computed(() => {
  const pos = position.value
  return [
    { header: 'Full Name', key: 'fullName' },
    { header: 'Where', key: 'where' },
    ...(pos?.scope === 'village' ? [{ header: 'Held Through', key: 'heldThrough' }] : []),
    { header: 'Status', key: 'status' },
    ...(pos?.trainingIds ?? []).map(id => ({ header: trainingNames.value.get(id) ?? '', key: `training:${id}` })),
    ...personExportColumns({ birthDate: hasPermission('person:read_birth_date'), demographics: hasPermission('person:read_demographics') }),
  ]
})
function holderExportRows () {
  const pos = position.value
  return groups.value.flatMap(g => [...g.rows]
    .sort((a, b) => a.person.fullName.localeCompare(b.person.fullName))
    .map(h => {
      const row = {
        personId: h.person.personId,
        fullName: h.person.fullName,
        where: positionPlace(h),
        status: h.person.active ? 'Active' : 'Inactive',
      }
      if (pos.scope === 'village') row.heldThrough = h.person.village?.villageId === h.village?.villageId ? 'Home' : 'Associate'
      for (const id of pos.trainingIds) {
        const d = latestByTraining.value.get(id)?.get(h.person.personId)
        row[`training:${id}`] = d === undefined ? '' : (d || 'No date')
      }
      return row
    }))
}
const { busy: exportBusy, download, exportSheet } = useExportActions({
  buildRows: () => withPersonDetail(holderExportRows(), row => row.personId),
  columns: exportColumns,
  filename: () => `${exportSlug(position.value.name)}-holders.csv`,
  sheetTitle: () => `${position.value.name} Holders`,
})

const personById = (id) => roster.value.find(p => p.personId === id) ?? holders.value.find(h => h.person.personId === id)?.person ?? {}
const statusFor = (group) => (p) => candidateStatus(p, group, position.value, holders.value, adds.value)
function select (group, p) {
  adds.value = [...adds.value, { key: `${p.personId}|${group.villageId ?? ''}|${group.circleId ?? ''}`, personId: p.personId, villageId: group.villageId, circleId: group.circleId }]
}
function markRemove (id) { removeIds.value = new Set([...removeIds.value, id]) }
function undo (id) { const s = new Set(removeIds.value); s.delete(id); removeIds.value = s }
function unadd (key) { adds.value = adds.value.filter(a => a.key !== key) }
function discard () { adds.value = []; removeIds.value = new Set(); openKey.value = null }

async function save () {
  saving.value = true
  const nAdd = adds.value.length
  const nRm = removeIds.value.size
  try {
    const before = new Set(holders.value.map(h => h.volunteerPositionId))
    const after = await patchPositionHolders(positionId.value, buildHoldersPatch(adds.value, removeIds.value))
    holders.value = after
    flashIds.value = new Set(after.filter(h => !before.has(h.volunteerPositionId)).map(h => h.volunteerPositionId))
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { flashIds.value = new Set() }, 2500)
    discard()
    const parts = [nAdd && `added ${nAdd} ${nAdd === 1 ? 'holder' : 'holders'}`, nRm && `removed ${nRm}`].filter(Boolean)
    toast.add({ severity: 'success', summary: 'Saved', detail: `${position.value.name}: ${parts.join(', ')}.`, life: 4000 })
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Not saved', detail: err?.body?.error ?? 'Failed to save holders', life: 5000 })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="position && loaded" class="position-detail">
    <div class="head">
      <div class="title-row">
        <h1>{{ position.name }}</h1>
        <ExportButton :disabled="exportBusy || !groups.some(g => g.rows.length)" @download="download" @export="exportSheet" />
      </div>
      <div class="stats">
        <Tag :value="scopeLabel(position.scope)" severity="secondary" />
        <span><b>{{ holders.length }}</b> {{ holders.length === 1 ? 'holder' : 'holders' }}</span>
        <span v-if="position.trainingIds.length">
          Expects <b>{{ position.trainingIds.map(id => trainingNames.get(id)).join(', ') }}</b>. VG reminds, never blocks.
        </span>
      </div>
    </div>
    <Select v-if="position.scope === 'village'" v-model="villageFilter" :options="villages" optionLabel="name" optionValue="villageId"
            placeholder="All villages" showClear aria-label="Village" class="filter" />
    <HolderGroup v-for="g in groups" :key="g.key" :group="g" :show-hint="position.trainingIds.length > 0" :hint-for="hintFor"
                 :remove-ids="removeIds" :flash-ids="flashIds" :roster="roster" :status="statusFor(g)" :can-write="canWrite" :open="openKey === g.key"
                 :person-by-id="personById" @toggle="openKey = openKey === g.key ? null : g.key" @select="p => select(g, p)"
                 @remove="markRemove" @undo="undo" @unadd="unadd" />
    <div v-if="dirty" class="form-footer">
      <span class="summary">{{ [adds.length && `${adds.length} to add`, removeIds.size && `${removeIds.size} to remove`].filter(Boolean).join(', ') }}</span>
      <Button label="Discard" severity="secondary" @click="discard" />
      <Button label="Save" :loading="saving" @click="save" />
    </div>
  </div>
</template>

<style scoped>
.position-detail { padding: 2rem; max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem; }
h1 { margin: 0; }
.title-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
.stats { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-top: 0.5rem; color: var(--color-text-dim); font-size: 0.9rem; }
.filter { max-width: 16rem; }
/* Pinned to the bottom of the viewport (UI spec §8). No ancestor may set overflow hidden/auto. */
.form-footer { position: sticky; bottom: 0; z-index: 2; display: flex; justify-content: flex-end; align-items: center; gap: 0.5rem;
  padding: 0.75rem 0; background: var(--color-background-darkest); border-top: 1px solid var(--color-border-default); }
.summary { margin-right: auto; }
@media (max-width: 640px) { .position-detail { padding: 1rem; } }
</style>
