<script setup>
import { ref, computed, onMounted } from 'vue'
import Chart from 'primevue/chart'
import SelectButton from 'primevue/selectbutton'
import MetaChartCard from './MetaChartCard.vue'
import { getMetaMetrics } from '../api/metaMetricsApi.js'
import { byVillage, byServiceType, byCategory } from '../lib/reduceCells.js'
import { buildBarData, buildProportionalData, barOptions } from '../lib/chartConfig.js'
import { getHttpStatus } from '../../../shared/api/apiClient.js'

const payload = ref(null)
const isLoading = ref(true)
const isDenied = ref(false)

// Default window: the trailing 30 days, matching the sheet this replaces.
function defaultRange () {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 29)
  const iso = d => d.toISOString().slice(0, 10)
  return { start: iso(start), end: iso(end) }
}

const range = ref(defaultRange())

// Per-chart view selection, mirroring VillageMetrics' per-chart status
// selectors rather than one page-level control.
const VIEW_OPTIONS = [
  { label: 'Counts', value: 'counts' },
  { label: 'Share', value: 'share' },
]
const villageView = ref('counts')

// Chart 2 switches resolution: 10 serviceName values, or the 4 category
// rollups. Both are legitimate — service names say what people ask for,
// categories say what kind of work a village does.
const GRAIN_OPTIONS = [
  { label: 'Detail', value: 'detail' },
  { label: 'Category', value: 'category' },
]
const serviceGrain = ref('detail')

// Dark mode is signalled by `.app-dark` on <html> (client/src/style.css).
const dark = computed(() => document.documentElement.classList.contains('app-dark'))

const villageRows = computed(() =>
  payload.value ? byVillage(payload.value.cells, payload.value.villages) : []
)
const serviceRows = computed(() => {
  if (!payload.value) return []
  return serviceGrain.value === 'category'
    ? byCategory(payload.value.cells)
    : byServiceType(payload.value.cells)
})
const serviceLabelKey = computed(() =>
  serviceGrain.value === 'category' ? 'category' : 'serviceName')

const villageData = computed(() => villageView.value === 'share'
  ? buildProportionalData(villageRows.value, 'villageName', { dark: dark.value })
  : buildBarData(villageRows.value, 'villageName', { dark: dark.value }))

const villageOptions = computed(() =>
  barOptions({ stacked: villageView.value === 'share', percent: villageView.value === 'share' }))

const serviceData = computed(() => buildBarData(serviceRows.value, serviceLabelKey.value, { dark: dark.value }))
const serviceOptions = computed(() => barOptions({ stacked: false, percent: false }))

// 44px per row keeps 13 villages readable and grows with a 14th.
const rowHeight = rows => Math.max(240, rows.length * 44 + 80)

onMounted(async () => {
  try {
    payload.value = await getMetaMetrics(range.value.start, range.value.end)
  }
  catch (err) {
    if (getHttpStatus(err) === 403) isDenied.value = true
    else throw err
  }
  finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="meta-metrics">
    <h1>Metrics</h1>

    <p v-if="isDenied" class="notice">
      You have no villages in scope, so there are no metrics to show.
    </p>

    <p v-else-if="isLoading" class="notice">Loading…</p>

    <template v-else-if="payload">
      <MetaChartCard
        title="Requests by village"
        :subtitle="`${range.start} to ${range.end}`"
        :height="rowHeight(villageRows)"
      >
        <template #controls>
          <SelectButton v-model="villageView" :options="VIEW_OPTIONS" optionLabel="label" optionValue="value" />
        </template>
        <Chart type="bar" :data="villageData" :options="villageOptions" />
      </MetaChartCard>

      <MetaChartCard
        title="Requests by service type"
        :subtitle="`${range.start} to ${range.end}`"
        :height="rowHeight(serviceRows)"
      >
        <template #controls>
          <SelectButton v-model="serviceGrain" :options="GRAIN_OPTIONS" optionLabel="label" optionValue="value" />
        </template>
        <Chart type="bar" :data="serviceData" :options="serviceOptions" />
      </MetaChartCard>
    </template>
  </div>
</template>

<style scoped>
.meta-metrics {
  padding: 2rem;
  min-width: 0;
}

h1 {
  margin: 0 0 1.5rem;
  color: var(--color-text-primary);
}

.notice {
  color: var(--color-text-secondary);
}

@media (max-width: 640px) {
  .meta-metrics { padding: 1rem; }
}
</style>
