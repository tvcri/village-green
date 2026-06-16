<script setup>
import { ref, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getAnalyticsSummary } from '../../../shared/api/analyticsApi.js'

const fromDate = ref(null)
const toDate = ref(null)
const userIdFilter = ref('')

const { state: summary, isLoading, execute: fetchSummary } = useAsyncState(
  () => getAnalyticsSummary({
    from: fromDate.value ? fromDate.value.toISOString() : undefined,
    to: toDate.value ? toDate.value.toISOString() : undefined,
    userId: userIdFilter.value || undefined,
  }),
  { immediate: true, initialState: [] }
)

let debounceTimer = null
function onFilterChange() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchSummary(), 400)
}

watch([fromDate, toDate, userIdFilter], onFilterChange)
</script>

<template>
  <div class="analytics-summary">
    <h1>Analytics Summary</h1>

    <div class="filters">
      <label>From</label>
      <DatePicker v-model="fromDate" showIcon dateFormat="yy-mm-dd" placeholder="Start date" />
      <label>To</label>
      <DatePicker v-model="toDate" showIcon dateFormat="yy-mm-dd" placeholder="End date" />
      <label>User ID</label>
      <InputText v-model="userIdFilter" placeholder="Filter by user ID" />
    </div>

    <DataTable :value="summary" :loading="isLoading" stripedRows>
      <Column field="routeName" header="Route" sortable />
      <Column field="totalVisits" header="Total Visits" sortable />
      <Column field="uniqueUsers" header="Unique Users" sortable />
      <Column field="lastVisited" header="Last Visited" sortable>
        <template #body="{ data }">
          {{ data.lastVisited ? new Date(data.lastVisited).toLocaleString() : '—' }}
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.analytics-summary {
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
}

h1 {
  margin: 0 0 1.5rem 0;
  color: var(--color-text-primary);
  font-size: 2rem;
}

.filters {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

label {
  color: var(--color-text-dim);
  font-size: 0.875rem;
}
</style>
