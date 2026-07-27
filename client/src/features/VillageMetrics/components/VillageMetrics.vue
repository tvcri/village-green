<!-- client/src/features/VillageMetrics/components/VillageMetrics.vue -->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { getVillageMetrics } from '../api/villageMetricsApi.js'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRefetchOnChange } from '../../../shared/composables/useRefetchOnChange.js'
import { presetRange, isValidRange } from '../lib/rangePresets.js'
import {
  STATUS_LABELS,
  STATUS_OPTIONS,
  CATEGORY_COLORS,
  categoryPie,
  servicePie,
  outcomesPie,
  stripStats,
} from '../lib/metricsView.js'
import { dateToServiceDate } from '../../../shared/lib/civilDate.js'
import MetricsRangePicker from './MetricsRangePicker.vue'
import MetricsCountTable from './MetricsCountTable.vue'
import MetricsSummaryStrip from './MetricsSummaryStrip.vue'
import MetricsPieCard from './MetricsPieCard.vue'

defineOptions({ name: 'VillageMetrics' })

const route = useRoute()
const router = useRouter()

// "today" as a civil string — reading the clock is allowed; parsing a stored value is not.
const todayCivil = dateToServiceDate(new Date())

const villageId = computed(() => String(route.params.villageId))
const range = computed(() => ({ start: route.query.start, end: route.query.end }))

// Identity-stable watch source. `range` returns a NEW object literal each evaluation, and
// watch compares non-deep sources with Object.is — so watching `range` refetches on ANY
// navigation, including a tab-only one (vue-router builds a fresh query object per
// navigation, which invalidates the computed even when start/end are unchanged).
// A primitive string collapses that to a real value comparison.
const rangeKey = computed(() => `${route.query.start}|${route.query.end}`)

// Normalize the URL to a valid range (default = this-year) whenever it is missing/invalid.
// Spreads the existing query so a normalize doesn't drop the `tab` selection.
function normalizeRange () {
  if (!isValidRange(range.value)) {
    const def = presetRange('thisYear', todayCivil)
    router.replace({ query: { ...route.query, start: def.start, end: def.end } })
    return false // a replace will re-trigger the watcher with a valid range
  }
  return true
}

const { state: metrics, isLoading, execute } = useAsyncState(
  () => getVillageMetrics(villageId.value, range.value.start, range.value.end),
  { immediate: false },
)

// Fetch only when the range is valid; normalize otherwise.
function fetchIfValid () {
  if (normalizeRange()) execute()
}

// Refetch on any villageId or range change. Watches `rangeKey` (a primitive) rather
// than `range` (an object literal), so this fires exactly when start/end actually
// change — notably NOT when only `tab` changes. It does not fire on initial mount
// (watch is lazy by default).
useRefetchOnChange([villageId, rangeKey], fetchIfValid)

// The single mount trigger. onMounted fires once; fetchIfValid either executes
// (valid query) or router.replaces the default — and that replace changes route.query,
// which the useRefetchOnChange watcher above then picks up to run the one real fetch.
// Net: exactly one fetch on entry (no double-fetch, no replace loop, because a valid
// range makes normalizeRange a no-op that returns true).
onMounted(() => fetchIfValid())

// Spread the existing query so changing the range preserves the active `tab`.
function onRangeUpdate ({ start, end }) {
  router.replace({ query: { ...route.query, start, end } })
}

// ---- tab selection (URL-backed) ----
const TAB_VALUES = ['categories', 'services', 'outcomes', 'people']

// Reads/writes ?tab=. Unknown or missing values fall back to 'categories' rather
// than writing a correction, so a hand-typed bad value renders sanely without an
// extra history entry. The setter spreads route.query so start/end survive.
const tab = computed({
  get: () => (TAB_VALUES.includes(route.query.tab) ? route.query.tab : 'categories'),
  set: (value) => {
    if (!TAB_VALUES.includes(value)) return
    router.replace({ query: { ...route.query, tab: value } })
  },
})

// ---- view state ----
const legs = ref(true) // default ON: a completed round trip counts as 2 legs
const catStatus = ref('completed')
const svcStatus = ref('completed')
const svcCategory = ref('all')

const categoryOptions = [
  { label: 'All categories', value: 'all' },
  ...Object.keys(CATEGORY_COLORS).map(c => ({ label: c, value: c })),
]

// "No completed requests in this range" / "No requests in this range" for 'all'.
function emptyMessageFor (sel) {
  const label = sel === 'all' ? '' : `${(STATUS_LABELS[sel] ?? sel).toLowerCase()} `
  return `No ${label}requests in this range`
}

// ---- derived views ----
const hasData = computed(() => !!metrics.value)

const strip = computed(() => (hasData.value ? stripStats(metrics.value, legs.value) : null))

const categoryView = computed(() => {
  if (!hasData.value) return null
  return {
    ...categoryPie(metrics.value.byCategory, catStatus.value, legs.value),
    emptyMessage: emptyMessageFor(catStatus.value),
  }
})

const serviceView = computed(() => {
  if (!hasData.value) return null
  return {
    ...servicePie(metrics.value.byServiceType, svcStatus.value, svcCategory.value, legs.value),
    emptyMessage: emptyMessageFor(svcStatus.value),
  }
})

const outcomesView = computed(() => {
  if (!hasData.value) return null
  return {
    ...outcomesPie(metrics.value.totals, legs.value),
    emptyMessage: 'No requests in this range',
  }
})

// People counts are "completed" counts, so the legs bump always applies when the
// toggle is on. Done here, not inside the (unchanged) MetricsCountTable.
function adjustPeople (rows) {
  return rows.map(r => ({ ...r, count: r.count + (legs.value ? (r.completedRoundTrips ?? 0) : 0) }))
}

const memberRows = computed(() => (hasData.value ? adjustPeople(metrics.value.byMember) : []))
const volunteerRows = computed(() => (hasData.value ? adjustPeople(metrics.value.byVolunteer) : []))

</script>

<template>
  <div class="village-metrics">
    <header class="metrics-header">
      <h1>{{ metrics?.villageName || 'Village' }} — Metrics</h1>
      <p class="exclusion-note">Hub-cancelled requests are excluded from all counts.</p>
      <MetricsRangePicker
        v-if="isValidRange(range)"
        :start="range.start"
        :end="range.end"
        :today="todayCivil"
        @update:range="onRangeUpdate"
      />
    </header>

    <div v-if="isLoading" class="loading-state"><p>Loading metrics…</p></div>

    <template v-else-if="hasData">
      <MetricsSummaryStrip :stats="strip" />

      <div class="legs-toggle">
        <ToggleSwitch v-model="legs" inputId="legsToggle" />
        <label for="legsToggle">Count round trips as 2 legs</label>
      </div>

      <Tabs v-model:value="tab" lazy>
        <TabList>
          <Tab value="categories">Categories</Tab>
          <Tab value="services">Services</Tab>
          <Tab value="outcomes">Outcomes</Tab>
          <Tab value="people">People</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="categories">
            <div class="panel-filters">
              <label for="catStatus">Status</label>
              <Select
                inputId="catStatus"
                v-model="catStatus"
                :options="STATUS_OPTIONS"
                optionLabel="label"
                optionValue="value"
              />
            </div>
            <MetricsPieCard v-bind="categoryView" />
          </TabPanel>

          <TabPanel value="services">
            <div class="panel-filters">
              <label for="svcStatus">Status</label>
              <Select
                inputId="svcStatus"
                v-model="svcStatus"
                :options="STATUS_OPTIONS"
                optionLabel="label"
                optionValue="value"
              />
              <label for="svcCategory">Category</label>
              <Select
                inputId="svcCategory"
                v-model="svcCategory"
                :options="categoryOptions"
                optionLabel="label"
                optionValue="value"
              />
            </div>
            <MetricsPieCard v-bind="serviceView" />
          </TabPanel>

          <TabPanel value="outcomes">
            <MetricsPieCard v-bind="outcomesView" />
          </TabPanel>

          <TabPanel value="people">
            <div class="people-grid">
              <section class="metrics-section">
                <h2>By member</h2>
                <p class="caption">Completed requests only.</p>
                <MetricsCountTable :rows="memberRows" nameHeader="Member" />
              </section>
              <section class="metrics-section">
                <h2>By volunteer</h2>
                <p class="caption">Completed requests only.</p>
                <MetricsCountTable :rows="volunteerRows" nameHeader="Volunteer" />
              </section>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </template>
  </div>
</template>

<style scoped>
.village-metrics { padding: 1rem 1.5rem; }
.metrics-header { margin-bottom: 1.5rem; }
.exclusion-note { color: var(--color-text-muted, #6b7280); font-size: 0.85rem; margin: 0.25rem 0 1rem; }
.metrics-section { margin-bottom: 2rem; }
.caption { color: var(--color-text-muted, #6b7280); font-size: 0.85rem; margin: 0 0 0.5rem; }
.legs-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.legs-toggle label { font-size: 0.9rem; cursor: pointer; }
.panel-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-bottom: 1rem;
}
.panel-filters label { color: var(--color-text-muted, #6b7280); font-size: 0.85rem; }
.people-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}
.loading-state { padding: 2rem; }
</style>
