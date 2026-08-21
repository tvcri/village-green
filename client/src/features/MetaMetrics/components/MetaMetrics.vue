<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Chart from 'primevue/chart'
import SelectButton from 'primevue/selectbutton'
import MetaChartCard from './MetaChartCard.vue'
import { getMetaMetrics } from '../api/metaMetricsApi.js'
import { byVillage, byServiceType, byCategory } from '../lib/reduceCells.js'
import { buildBarData, buildProportionalData, barOptions } from '../lib/chartConfig.js'
import { getHttpStatus } from '../../../shared/api/apiClient.js'
import { dateToServiceDate } from '../../../shared/lib/civilDate.js'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRefetchOnChange } from '../../../shared/composables/useRefetchOnChange.js'
import { presetRange, isValidRange } from '../../VillageMetrics/lib/rangePresets.js'
import MetricsRangePicker from '../../VillageMetrics/components/MetricsRangePicker.vue'

const route = useRoute()
const router = useRouter()

// "today" as a civil string — reading the clock is allowed; parsing a stored value is not.
const todayCivil = dateToServiceDate(new Date())

const range = computed(() => ({ start: route.query.start, end: route.query.end }))

// Identity-stable watch source. `range` returns a NEW object literal each evaluation, and
// watch compares non-deep sources with Object.is — so watching `range` refetches on ANY
// navigation, including one that leaves start/end untouched (vue-router builds a fresh
// query object per navigation, which invalidates the computed even when unchanged).
// A primitive string collapses that to a real value comparison.
const rangeKey = computed(() => `${route.query.start}|${route.query.end}`)

// Normalize the URL to a valid range (default = this-year, matching VillageMetrics)
// whenever it is missing/invalid. Spreads the existing query so a normalize doesn't
// drop any other query params.
function normalizeRange () {
  if (!isValidRange(range.value)) {
    const def = presetRange('thisYear', todayCivil)
    router.replace({ query: { ...route.query, start: def.start, end: def.end } })
    return false // a replace will re-trigger the watcher with a valid range
  }
  return true
}

const { state: payload, isLoading, error, execute } = useAsyncState(
  () => getMetaMetrics(range.value.start, range.value.end),
  // A 403 here means the caller has no granted villages at all — an expected
  // outcome, not a bug. Show it inline instead of the global crash-style error modal.
  { immediate: false, onError: null },
)

const isDenied = computed(() => getHttpStatus(error.value) === 403)

// Fetch only when the range is valid; normalize otherwise.
function fetchIfValid () {
  if (normalizeRange()) execute()
}

// Refetch on range change. Watches `rangeKey` (a primitive) rather than `range`
// (an object literal), so this fires exactly when start/end actually change.
// It does not fire on initial mount (watch is lazy by default).
useRefetchOnChange([rangeKey], fetchIfValid)

// The single mount trigger. onMounted fires once; fetchIfValid either executes
// (valid query) or router.replaces the default — and that replace changes route.query,
// which the useRefetchOnChange watcher above then picks up to run the one real fetch.
// Net: exactly one fetch on entry (no double-fetch, no replace loop, because a valid
// range makes normalizeRange a no-op that returns true).
onMounted(() => fetchIfValid())

// Spread the existing query so changing the range preserves any other query params.
function onRangeUpdate ({ start, end }) {
  router.replace({ query: { ...route.query, start, end } })
}

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
</script>

<template>
  <div class="meta-metrics">
    <h1>Metrics</h1>

    <MetricsRangePicker
      v-if="isValidRange(range)"
      :start="range.start"
      :end="range.end"
      :today="todayCivil"
      @update:range="onRangeUpdate"
    />

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
  margin-top: 1.5rem;
}

@media (max-width: 640px) {
  .meta-metrics { padding: 1rem; }
}
</style>
