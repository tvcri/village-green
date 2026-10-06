<script setup>
// One training's page (UI spec §4): completions, and the record panel in place.
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import RecordCompletionsPanel from './RecordCompletionsPanel.vue'
import { getTrainings, getTrainingCompletions, deleteTrainingCompletion } from '../api/trainingApi.js'
import { getPositions } from '../../Positions/api/positionApi.js'
import { getVolunteerRoster } from '../../VolunteerList/api/volunteerApi.js'
import { formatCivilDate } from '../../../shared/lib/civilDate.js'
import { useCurrentUser } from '../../../shared/composables/useCurrentUser.js'
import { useUnsavedChangesGuard } from '../../../shared/composables/useUnsavedChangesGuard.js'

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()
const { hasPermission } = useCurrentUser()
const canWrite = computed(() => hasPermission('volunteer:write'))
const trainingId = computed(() => route.params.trainingId)

const training = ref(null)
const positions = ref([])
const completions = ref([])
const roster = ref([])
const recording = ref(false)
const panelDirty = ref(false)
const flashIds = ref(new Set())
const search = ref('')
const villageFilter = ref(null)
useUnsavedChangesGuard(() => panelDirty.value)

const linkedPositions = computed(() => positions.value.filter(p => p.trainingIds.includes(trainingId.value) && p.scope !== 'circle'))
const allLinked = computed(() => positions.value.filter(p => p.trainingIds.includes(trainingId.value)))
const villageOptions = computed(() => [...new Set(completions.value.map(c => c.person.village?.name).filter(Boolean))].sort())
const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  return completions.value.filter(c =>
    (!villageFilter.value || c.person.village?.name === villageFilter.value) &&
    (!q || c.person.fullName.toLowerCase().includes(q) || c.person.displayName.toLowerCase().includes(q)))
})

async function loadCompletions () { completions.value = await getTrainingCompletions(trainingId.value) }
onMounted(async () => {
  try {
    const [list, pos] = await Promise.all([getTrainings(), getPositions()])
    training.value = list.find(t => t.trainingId === trainingId.value) ?? null
    positions.value = pos
    await loadCompletions()
  }
  catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load the training', life: 3000 })
  }
})

async function openPanel () {
  if (!roster.value.length) roster.value = await getVolunteerRoster()
  recording.value = true
}

async function onSaved ({ result, date, message }) {
  recording.value = false
  await loadCompletions()
  flashIds.value = new Set(completions.value
    .filter(c => c.completedDate === date && result.recorded.includes(c.person.personId))
    .map(c => c.volunteerTrainingId))
  setTimeout(() => { flashIds.value = new Set() }, 2500)
  toast.add({ severity: 'success', summary: 'Recorded', detail: message, life: 5000 })
}

function askRemove (row) {
  const others = completions.value.filter(c => c.person.personId === row.person.personId && c.volunteerTrainingId !== row.volunteerTrainingId).length
  confirm.require({
    header: 'Remove this record?',
    message: `Remove ${row.person.displayName}’s ${training.value.name} record from ${row.completedDate ? formatCivilDate(row.completedDate) : 'no date'}? ${others ? 'Their other completion stays.' : 'They will have no record of this training.'}`,
    acceptLabel: 'Remove',
    rejectLabel: 'Cancel',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary' },
    accept: async () => {
      try {
        await deleteTrainingCompletion(trainingId.value, row.volunteerTrainingId)
        toast.add({ severity: 'success', summary: 'Removed', detail: `Removed ${row.person.displayName}’s record.`, life: 2500 })
      }
      catch (err) {
        toast.add({ severity: 'error', summary: 'Error', detail: err?.body?.error ?? 'Failed to remove the record', life: 3000 })
      }
      await loadCompletions()
    },
  })
}

function openPerson (row) { router.push({ name: 'meta-person-detail', params: { personId: row.person.personId } }) }
</script>

<template>
  <div v-if="training" class="training-detail">
    <div class="head-row">
      <div>
        <h1>{{ training.name }}</h1>
        <p v-if="training.description" class="subtitle">{{ training.description }}</p>
        <div class="stats">
          <span><b>{{ completions.length }}</b> {{ completions.length === 1 ? 'completion' : 'completions' }}</span>
          <span v-if="allLinked.length">Leads to <b v-for="(p, i) in allLinked" :key="p.positionId">{{ p.name }}{{ i < allLinked.length - 1 ? ' and ' : '' }}</b></span>
        </div>
      </div>
      <Button v-if="canWrite && !recording" label="Record completions" icon="pi pi-plus" @click="openPanel" />
    </div>

    <RecordCompletionsPanel v-if="recording" v-model:dirty="panelDirty" :training="training" :linked-positions="linkedPositions"
                            :completions="completions" :roster="roster" @saved="onSaved" @close="recording = false" />

    <h2>Completed</h2>
    <div class="filters">
      <InputText v-model="search" type="search" placeholder="Search by name" aria-label="Search completions by name" />
      <Select v-model="villageFilter" :options="villageOptions" placeholder="All villages" showClear aria-label="Village" />
    </div>
    <DataTable :value="shown" size="small" dataKey="volunteerTrainingId" paginator :rows="25"
               :rowClass="row => (flashIds.has(row.volunteerTrainingId) ? 'flash' : '')">
      <Column header="Volunteer">
        <template #body="{ data }"><a class="link" @click="openPerson(data)">{{ data.person.fullName }}</a></template>
      </Column>
      <Column header="Village"><template #body="{ data }">{{ data.person.village?.name ?? 'Hub volunteer' }}</template></Column>
      <Column header="Status"><template #body="{ data }">{{ data.person.active ? 'Active' : 'Inactive' }}</template></Column>
      <Column header="Completed">
        <template #body="{ data }">{{ data.completedDate ? formatCivilDate(data.completedDate) : 'No date' }}</template>
      </Column>
      <Column header="Notes"><template #body="{ data }"><span class="dim">{{ data.notes }}</span></template></Column>
      <Column v-if="canWrite" header="">
        <template #body="{ data }">
          <Button icon="pi pi-trash" text rounded severity="danger" aria-label="Remove this record" @click="askRemove(data)" />
        </template>
      </Column>
      <template #empty>{{ search || villageFilter ? 'No completions match.' : 'No completions recorded yet.' }}</template>
    </DataTable>
  </div>
</template>

<style scoped>
.training-detail { padding: 2rem; max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem; }
.head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
h1 { margin: 0; }
h2 { margin: 0.5rem 0 0; font-size: 1.1rem; }
.subtitle { margin: 0.25rem 0 0; color: var(--color-text-dim); }
.stats { display: flex; gap: 1.25rem; flex-wrap: wrap; margin-top: 0.5rem; color: var(--color-text-dim); font-size: 0.9rem; }
.filters { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.link { color: var(--color-primary); cursor: pointer; }
.dim { color: var(--color-text-dim); }
:deep(tr.flash td) { animation: flash 2.4s ease-out; }
@keyframes flash { 0%, 40% { box-shadow: inset 0 0 0 999px rgba(250, 204, 21, 0.35); } 100% { box-shadow: none; } }
@media (max-width: 640px) { .training-detail { padding: 1rem; } }
</style>
