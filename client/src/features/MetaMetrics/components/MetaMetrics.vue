<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import SelectButton from 'primevue/selectbutton'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import MetaOutcomesCard from './MetaOutcomesCard.vue'
import MetaSummaryStrip from './MetaSummaryStrip.vue'
import { getMetaMetrics } from '../api/metaMetricsApi.js'
import { byVillage, STATUS_SERIES } from '../lib/reduceCells.js'
import { byVillageCategory, CATEGORY_SERIES } from '../lib/byVillageCategory.js'
import { byVillageService, serviceSeries, drilldownCategories } from '../lib/byVillageService.js'
import { orderRows, DEFAULT_SORT } from '../lib/orderRows.js'
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

const TAB_VALUES = ['outcomes', 'categories', 'detail']
const tab = urlState('tab', TAB_VALUES, 'outcomes')

const TAB_LABELS = { outcomes: 'Outcomes', categories: 'Categories', detail: 'Detail' }

// Outcomes GROUPS because its three series do not compose into a whole.
// Categories and Detail both STACK: categories partition a village's work, and
// a category's services partition that category.
const isOutcomes = computed(() => tab.value === 'outcomes')
const isCategories = computed(() => tab.value === 'categories')
const isDetail = computed(() => tab.value === 'detail')

// Only categories with more than one service are worth drilling into — Home
// Help and Tech Support have exactly one each today, so their detail table
// would be a single column identical to the total. Derived from the payload so
// a category appears the moment it gains a second service.
const detailOptions = computed(() =>
  payload.value ? drilldownCategories(payload.value.cells) : [])

// REQUIRED, with no "all": a table of every service across every category is
// the 130-cell explosion this tab exists to avoid. Defaults to the first
// available option (Rides in practice, at ~74% of all requests).
const detailCategory = computed({
  get: () => (detailOptions.value.includes(route.query.category)
    ? route.query.category
    : detailOptions.value[0] ?? ''),
  set: (value) => {
    if (!detailOptions.value.includes(value)) return
    router.replace({ query: { ...route.query, category: value } })
  },
})

// Each tab supplies its own series, and with them its own valid sort columns.
const series = computed(() => {
  if (isDetail.value) {
    return payload.value ? serviceSeries(payload.value.cells, detailCategory.value) : []
  }
  return isCategories.value ? CATEGORY_SERIES : STATUS_SERIES
})
const seriesKeys = computed(() => series.value.map(s => s.key))

const VIEW_OPTIONS = [
  { label: 'Counts', value: 'counts' },
  { label: 'Share', value: 'share' },
]
const view = urlState('view', ['counts', 'share'], 'counts')

const sortKeys = computed(() => ['villageName', 'total', ...seriesKeys.value])
// urlState needs the valid set at call time, and it changes with the tab — so
// this one is written out rather than using the helper. Same contract: read
// when valid, fall back silently otherwise, never write a correction.
const sort = computed({
  get: () => (sortKeys.value.includes(route.query.sort) ? route.query.sort : DEFAULT_SORT.sort),
  set: (value) => {
    if (!sortKeys.value.includes(value)) return
    router.replace({ query: { ...route.query, sort: value } })
  },
})
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
const villageRows = computed(() => {
  if (!payload.value) return []
  const { cells, villages } = payload.value
  if (isDetail.value) {
    return byVillageService(cells, villages, detailCategory.value, { legs: true })
  }
  return isCategories.value
    ? byVillageCategory(cells, villages, { legs: true })
    : byVillage(cells, villages, { legs: true })
})

// ONE ordered list. The bars live inside the table's rows, so ordering the
// rows orders the bars — there is no second thing to keep in step.
const orderedRows = computed(() =>
  orderRows(villageRows.value, {
    sort: sort.value, dir: dir.value, view: view.value, seriesKeys: seriesKeys.value,
  })
)

// Always the OUTCOME totals, whichever tab is showing. The strip answers "how
// is the hub doing" and must not change meaning under the reader when they
// switch tabs — and a Categories row carries no completed/cancelled fields to
// sum anyway.
const strip = computed(() => metaStripStats(
  payload.value ? byVillage(payload.value.cells, payload.value.villages, { legs: true }) : [],
))

const csvName = computed(() => metaCsvFilename({
  // The category rides along in the tab slug, so a Rides download and an
  // Errands download do not land as the same filename.
  tab: isDetail.value && detailCategory.value
    ? `detail-${detailCategory.value.toLowerCase().replace(/\s+/g, '-')}`
    : tab.value,
  view: view.value,
  start: range.value.start,
  end: range.value.end,
}))

// The bar means something different on each tab, so the caption has to say
// which. Categories counts COMPLETED work only — its bar is work done, not
// requests received — and that is not inferable from the chart itself.
const scaleNote = computed(() => {
  if (isDetail.value) {
    return view.value === 'share'
      ? `Completed ${detailCategory.value.toLowerCase()} only. Each bar is that village’s own mix.`
      : `Completed ${detailCategory.value.toLowerCase()} only. Bar length is the village’s total; segments are its mix.`
  }
  if (isCategories.value) {
    return view.value === 'share'
      ? 'Completed work only. Each bar is that village’s own mix of categories.'
      : 'Completed work only. Bar length is the village’s total work; segments are its mix.'
  }
  return view.value === 'share'
    ? 'Each bar is that village’s own total, split by outcome.'
    : 'Bars share one scale, so lengths compare directly between villages.'
})

const emptyMessage = computed(() => (isCategories.value || isDetail.value
  ? 'No completed requests in this range'
  : 'No requests in this range'))

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
          <Tab v-for="value in TAB_VALUES" :key="value" :value="value">{{ TAB_LABELS[value] }}</Tab>
        </TabList>
        <TabPanels>
          <!-- Both panels render the same card; only the series, the layout and
               the scale note differ, so the markup is shared rather than
               duplicated. `lazy` on Tabs means only the active one mounts. -->
          <TabPanel v-for="value in TAB_VALUES" :key="value" :value="value">
            <div class="panel-filters">
              <SelectButton
                v-model="view"
                :options="VIEW_OPTIONS"
                optionLabel="label"
                optionValue="value"
                :allowEmpty="false"
                aria-label="Bar view"
              />
              <!-- Detail only, and deliberately with no "all" option: every
                   service at once is the 130-cell table this tab exists to
                   avoid. Scoped to a category it is at most seven columns. -->
              <template v-if="isDetail && detailOptions.length">
                <label for="detailCategory">Category</label>
                <Select
                  inputId="detailCategory"
                  v-model="detailCategory"
                  :options="detailOptions"
                  aria-label="Service category"
                />
              </template>
            </div>
            <!-- Nothing to drill into: every category has a single service, so
                 a detail table would repeat the Categories tab column for
                 column. Says so rather than rendering an empty card. -->
            <p v-if="isDetail && !detailOptions.length" class="notice">
              No category has more than one service in this range, so there is
              nothing to break down here.
            </p>

            <MetaOutcomesCard
              v-else
              :rows="orderedRows"
              :series="series"
              :view="view"
              :sort="sort"
              :dir="dir"
              :csvFilename="csvName"
              :dark="dark"
              :layout="isOutcomes ? 'grouped' : 'stacked'"
              :scaleNote="scaleNote"
              :emptyMessage="emptyMessage"
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
