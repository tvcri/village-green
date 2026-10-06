<script setup>
// Hub › Trainings (UI spec §4). Read-only; editing the list happens in Admin.
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { getTrainings } from '../api/trainingApi.js'
import { getPositions } from '../../Positions/api/positionApi.js'

const router = useRouter()
const trainings = ref([])
const positions = ref([])
const leadsTo = (id) => positions.value.filter(p => p.trainingIds.includes(id))
const rows = computed(() => [...trainings.value].sort((a, b) => a.name.localeCompare(b.name)))
onMounted(async () => { [trainings.value, positions.value] = await Promise.all([getTrainings(), getPositions()]) })
const open = (e) => router.push({ name: 'meta-training-detail', params: { trainingId: e.data.trainingId } })
</script>

<template>
  <div class="training-list">
    <h1>Trainings</h1>
    <p class="subtitle">Choose a training to see who has completed it, or to record new completions.</p>
    <DataTable :value="rows" size="small" dataKey="trainingId" rowHover class="clickable" @rowClick="open">
      <Column field="name" header="Training" />
      <Column header="Leads to">
        <template #body="{ data }">
          <Tag v-for="p in leadsTo(data.trainingId)" :key="p.positionId" :value="p.name" severity="secondary" class="chip" />
          <span v-if="!leadsTo(data.trainingId).length" class="dim">—</span>
        </template>
      </Column>
      <Column field="holderCount" header="Volunteers" />
      <template #empty>No trainings yet. An application administrator adds them under Admin › Trainings.</template>
    </DataTable>
  </div>
</template>

<style scoped>
.training-list { padding: 2rem; max-width: 960px; margin: 0 auto; }
h1 { margin: 0 0 0.25rem; }
.subtitle { margin: 0 0 1rem; color: var(--color-text-dim); }
.chip { margin-right: 0.25rem; }
.dim { color: var(--color-text-dim); }
.clickable :deep(tbody tr) { cursor: pointer; }
</style>
