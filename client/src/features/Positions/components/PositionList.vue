<script setup>
// Hub › Positions (UI spec §5). Read-only; editing the list happens in Admin.
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { getPositions } from '../api/positionApi.js'
import { getTrainings } from '../../Trainings/api/trainingApi.js'
import { scopeLabel } from '../../../shared/lib/positionRules.js'

const router = useRouter()
const positions = ref([])
const trainings = ref([])
const name = (id) => trainings.value.find(t => t.trainingId === id)?.name
const rows = computed(() => [...positions.value].sort((a, b) => a.name.localeCompare(b.name)))
onMounted(async () => { [positions.value, trainings.value] = await Promise.all([getPositions(), getTrainings()]) })
const open = (e) => router.push({ name: 'meta-position-detail', params: { positionId: e.data.positionId } })
</script>

<template>
  <div class="position-list">
    <h1>Positions</h1>
    <p class="subtitle">Choose a position to see who holds it and to add or remove holders. Positions record what volunteers do; they don’t grant access to Village Green.</p>
    <DataTable :value="rows" size="small" dataKey="positionId" rowHover class="clickable" @rowClick="open">
      <Column field="name" header="Position" />
      <Column header="Scope"><template #body="{ data }"><Tag :value="scopeLabel(data.scope)" severity="secondary" /></template></Column>
      <Column header="Expected training">
        <template #body="{ data }">
          <Tag v-for="id in data.trainingIds" :key="id" :value="name(id)" severity="secondary" class="chip" />
          <span v-if="!data.trainingIds.length" class="dim">—</span>
        </template>
      </Column>
      <Column field="holderCount" header="Holders" />
      <template #empty>No positions yet. An application administrator adds them under Admin › Positions.</template>
    </DataTable>
  </div>
</template>

<style scoped>
.position-list { padding: 2rem; max-width: 960px; margin: 0 auto; }
h1 { margin: 0 0 0.25rem; }
.subtitle { margin: 0 0 1rem; color: var(--color-text-dim); max-width: 65ch; }
.chip { margin-right: 0.25rem; }
.dim { color: var(--color-text-dim); }
.clickable :deep(tbody tr) { cursor: pointer; }
</style>
