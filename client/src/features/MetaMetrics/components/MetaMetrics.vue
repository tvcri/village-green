<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import SelectButton from 'primevue/selectbutton'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import MetaChartCard from './MetaChartCard.vue'
import MetaSummaryStrip from './MetaSummaryStrip.vue'
import { getMetaMetrics } from '../api/metaMetricsApi.js'
import { byVillage, STATUS_SERIES } from '../lib/reduceCells.js'
import { orderRows, DEFAULT_SORT } from '../lib/orderRows.js'
import { buildBarData, buildProportionalData, barOptions } from '../lib/chartConfig.js'
import { metaStripStats } from '../lib/stripStats.js'
import { metaCsvFilename } from '../lib/matrixTable.js'
import { getHttpStatus } from '../../../shared/api/apiClient.js'
import { dateToServiceDate } from '../../../shared/lib/civilDate.js'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRefetchOnChange } from '../../../shared/composables/useRefetchOnChange.js'
import { presetRange, isValidRange } from '../../VillageMetrics/lib/rangePresets.js'
import MetricsRangePicker from '../../VillageMetrics/components/MetricsRangePicker.vue'

defineOptions({ name: 'MetaMetrics' })

const route = useRoute()
const router = useRouter()

// "today" as a civil string — reading the clock is allowed; parsing a stored value is not.
const todayCivil = dateToServiceDate(new Date())

const range = computed(() => ({ start: route.query.start, end: route.query.end }))

// Identity-stable watch source. `range` returns a NEW object literal each evaluation, and
// watch compares non-deep sources with Object.is — so watching `range` refetches on ANY
// navigation, including a tab-only one. A primitive string collapses that to a real
// value comparison.
const rangeKey = computed(() => `${route.query.start}|${route.query.end}`)

// Normalize the URL to a valid range (default = this-year) whenever it is missing/invalid.
// Spreads the existing query so a normalize doesn't drop tab/view/sort.
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
  // outcome, not a bug. Show it inline instead of the global error modal.
  { immediate: false, onError: null },
)

const isDenied = computed(() => getHttpStatus(error.value) === 403)

function fetchIfValid () {
  if (normalizeRange()) execute()
}

useRefetchOnChange([rangeKey], fetchIfValid)

// The single mount trigger — see VillageMetrics.vue for the full note. Net:
// exactly one fetch on entry, no double-fetch and no replace loop.
onMounted(() => fetchIfValid())

function onRangeUpdate ({ start, end }) {
  router.replace({ query: { ...route.query, start, end } })
}

// ---- URL-backed selections ----
// All follow the same shape: read when present and valid, otherwise fall back
// WITHOUT writing a correction, so a hand-typed bad value renders sanely with no
// extra history entry. Every setter spreads route.query so params don't clobber
// each other.
function urlState (param, values, fallback) {
  return computed({
    get: () => (values.includes(route.query[param]) ? route.query[param] : fallback),
    set: (value) => {
      if (!values.includes(value)) return
      router.replace({ query: { ...route.query, [param]: value } })
    },
  })
}

// Stage 1 ships Outcomes only; categories/services are stage 2.
const TAB_VALUES = ['outcomes']
const tab = urlState('tab', TAB_VALUES, 'outcomes')

const VIEW_OPTIONS = [
  { label: 'Counts', value: 'counts' },
  { label: 'Share', value: 'share' },
]
const view = urlState('view', ['counts', 'share'], 'counts')

const SORT_KEYS = ['villageName', 'completed', 'cancelled', 'unmatched', 'total']
const sort = urlState('sort', SORT_KEYS, DEFAULT_SORT.sort)
const dir = urlState('dir', ['asc', 'desc'], DEFAULT_SORT.dir)

function onSortUpdate (next) {
  router.replace({ query: { ...route.query, sort: next.sort, dir: next.dir } })
}

// ---- theme ----
// The theme toggle swaps `app-dark` on <html>, which is invisible to Vue, so a
// computed reading it would never re-evaluate. The observer is what makes it react.
const themeTick = ref(0)
let themeObserver = null

onMounted(() => {
  if (typeof MutationObserver === 'undefined') return
  themeObserver = new MutationObserver(() => { themeTick.value++ })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
})

const dark = computed(() => {
  void themeTick.value
  return document.documentElement.classList.contains('app-dark')
})

// ---- derived views ----
// legs is pinned TRUE: the federation counts a completed round trip as two
// services and will not count differently, so this page ships no toggle. The
// parameter stays for a future multi-village-grant user.
const villageRows = computed(() =>
  payload.value ? byVillage(payload.value.cells, payload.value.villages, { legs: true }) : []
)

// ONE ordered list, consumed by both the chart and the table.
const orderedRows = computed(() =>
  orderRows(villageRows.value, { sort: sort.value, dir: dir.value, view: view.value })
)

const strip = computed(() => metaStripStats(villageRows.value))

const chartData = computed(() => (view.value === 'share'
  ? buildProportionalData(orderedRows.value, 'villageName', { dark: dark.value, series: STATUS_SERIES })
  : buildBarData(orderedRows.value, 'villageName', { dark: dark.value, series: STATUS_SERIES })))

const chartOptions = computed(() =>
  barOptions({ stacked: view.value === 'share', percent: view.value === 'share' }))

const csvName = computed(() => metaCsvFilename({
  tab: tab.value,
  view: view.value,
  start: range.value.start,
  end: range.value.end,
}))

const showCountingInfo = ref(false)
</script>

<template>
  <div class="meta-metrics">
    <header class="metrics-header">
      <div class="header-row">
        <h1>Hub — Metrics</h1>
      </div>
      <p class="exclusion-note">
        Hub-cancelled requests are excluded from all counts.
        Completed round-trip rides count as two services.
        <Button
          icon="pi pi-info-circle"
          text
          rounded
          severity="secondary"
          aria-label="About round-trip ride counting"
          @click="showCountingInfo = true"
        />
      </p>
      <MetricsRangePicker
        v-if="isValidRange(range)"
        :start="range.start"
        :end="range.end"
        :today="todayCivil"
        @update:range="onRangeUpdate"
      />
    </header>

    <p v-if="isDenied" class="notice">
      You have no villages in scope, so there are no metrics to show.
    </p>

    <p v-else-if="isLoading" class="notice">Loading metrics…</p>

    <template v-else-if="payload">
      <MetaSummaryStrip :stats="strip" />

      <Tabs v-model:value="tab" lazy>
        <TabList>
          <Tab value="outcomes">Outcomes</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="outcomes">
            <div class="panel-filters">
              <SelectButton
                v-model="view"
                :options="VIEW_OPTIONS"
                optionLabel="label"
                optionValue="value"
                :allowEmpty="false"
                aria-label="Chart view"
              />
            </div>
            <MetaChartCard
              :rows="orderedRows"
              :series="STATUS_SERIES"
              :view="view"
              :sort="sort"
              :dir="dir"
              :csvFilename="csvName"
              :chartData="chartData"
              :chartOptions="chartOptions"
              :dark="dark"
              @update:sort="onSortUpdate"
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </template>

    <Dialog
      v-model:visible="showCountingInfo"
      modal
      header="Round-trip Rides"
      :style="{ width: '28rem' }"
      :breakpoints="{ '640px': '90vw' }"
    >
      <p class="info-body">
        Many health insurers count round-trip rides to medical appointments as
        TWO services even if the driver waited for the insured and provided the
        return trip home. The Hub follows this practice, so every completed
        round-trip ride counts as two services throughout this dashboard.
      </p>
    </Dialog>
  </div>
</template>

<style scoped>
.meta-metrics { padding: 1rem 1.5rem; min-width: 0; }
.metrics-header { margin-bottom: 1.5rem; }
.header-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
}
.header-row h1 { margin: 0; color: var(--color-text-primary); }
.exclusion-note {
  color: var(--color-text-muted, #6b7280);
  font-size: 0.85rem;
  margin: 0.25rem 0 1rem;
}
.notice { color: var(--color-text-muted, #6b7280); margin-top: 1.5rem; }
.panel-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-bottom: 1rem;
}
.info-body { margin: 0; line-height: 1.5; }

@media (max-width: 640px) {
  .meta-metrics { padding: 1rem 0.75rem; }
  .panel-filters { flex-direction: column; align-items: stretch; }
}
</style>
