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
import { metaCsvFilename, matrixColumns, matrixCells } from '../lib/matrixTable.js'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { buildMetaMetricsPdf } from '../lib/metaMetricsPdf.js'
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
// Takes the tab rather than reading the active one, because the PDF needs the
// note for all three sections at once, not just the one on screen.
function noteFor (tabValue, viewValue) {
  if (tabValue === 'detail') {
    const cat = detailCategory.value.toLowerCase()
    return viewValue === 'share'
      ? `Completed ${cat} only. Each bar is that village’s own mix.`
      : `Completed ${cat} only. Bar length is the village’s total; segments are its mix.`
  }
  if (tabValue === 'categories') {
    return viewValue === 'share'
      ? 'Completed work only. Each bar is that village’s own mix of categories.'
      : 'Completed work only. Bar length is the village’s total work; segments are its mix.'
  }
  return viewValue === 'share'
    ? 'Each bar is that village’s own total, split by outcome.'
    : 'Bars share one scale, so lengths compare directly between villages.'
}

const scaleNote = computed(() => noteFor(tab.value, view.value))

const emptyMessage = computed(() => (isCategories.value || isDetail.value
  ? 'No completed requests in this range'
  : 'No requests in this range'))

// The export lives here rather than in the table because the button sits on the
// tab strip, above the card — and the page already holds everything the file
// needs. Full labels, not the abbreviated headers: a CSV column has no width to
// fit into and a reader opening the file expects the real name.
function onDownloadCsv () {
  const columns = matrixColumns(series.value, view.value, { full: true })
  downloadCsv(toCsv(matrixCells(orderedRows.value, series.value, view.value), columns), csvName.value)
}

// ---- PDF export ----
// Covers ALL THREE tabs, like the village report — a document you hand someone,
// not a print of whatever happens to be on screen. So it derives each section
// from the payload directly rather than reading the active tab's state.
//
// The current view (counts vs share) IS carried through, because it is the
// reader's stated question, not an accident of navigation.
const isExporting = ref(false)

function sectionFor (tabValue) {
  if (!payload.value) return null
  const { cells, villages } = payload.value

  const rows = tabValue === 'outcomes'
    ? byVillage(cells, villages, { legs: true })
    : tabValue === 'categories'
      ? byVillageCategory(cells, villages, { legs: true })
      : byVillageService(cells, villages, detailCategory.value, { legs: true })

  const sectionSeries = tabValue === 'outcomes'
    ? STATUS_SERIES
    : tabValue === 'categories'
      ? CATEGORY_SERIES
      : serviceSeries(cells, detailCategory.value)

  if (!sectionSeries.length) return null

  return {
    key: tabValue,
    // Detail's heading names the category, since "Detail" alone would not say
    // which one the reader is looking at once the tab strip is gone.
    title: tabValue === 'detail' ? `Detail — ${detailCategory.value}` : TAB_LABELS[tabValue],
    note: noteFor(tabValue, view.value),
    rows: orderRows(rows, {
      sort: sort.value, dir: dir.value, view: view.value,
      seriesKeys: sectionSeries.map(x => x.key),
    }),
    series: sectionSeries,
    layout: tabValue === 'outcomes' ? 'grouped' : 'stacked',
  }
}

async function onDownloadPdf () {
  isExporting.value = true
  try {
    const bytes = await buildMetaMetricsPdf({
      start: range.value.start,
      end: range.value.end,
      strip: strip.value,
      view: view.value,
      sections: TAB_VALUES.map(sectionFor).filter(Boolean),
    })
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = csvName.value.replace(/\.csv$/, '.pdf')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } finally {
    isExporting.value = false
  }
}

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

      <!-- PAGE level, not per tab. It is one `?view=` param shared by every
           tab, so rendering it inside each filter row implied a per-table
           choice it never was: picking Share on one tab and Counts on another
           silently changed both. It sat there only because an earlier Services
           tab could not honour it and a disabled control reads as broken —
           that tab no longer exists, and all three now support both views. -->
      <div class="view-bar">
        <SelectButton
          v-model="view"
          :options="VIEW_OPTIONS"
          optionLabel="label"
          optionValue="value"
          :allowEmpty="false"
          aria-label="Bar view"
        />
        <!-- Beside the toggle rather than inside the card, because it describes
             what the toggle DOES. Inside the card it explained a control that
             lives outside it, and read as stray helper text while costing the
             table a line of vertical space. -->
        <p class="scale-note">{{ scaleNote }}</p>

        <!-- PAGE level, beside the toggle, because that is its scope: the
             document covers all three tabs AND the summary strip. Download CSV
             stays on the tab strip because it is exactly one table — putting
             the two together implied they were the same kind of export.
             No spinner: a measured export runs well under a second, where one
             would only flash. The disabled state prevents the
             double-click-two-documents race. -->
        <Button
          class="pdf-button"
          icon="pi pi-file-pdf"
          :label="isExporting ? 'Preparing…' : 'Download PDF'"
          :disabled="isExporting"
          @click="onDownloadPdf"
        />
      </div>

      <!-- The CSV button is absolutely positioned over the right of the tab
           strip: it costs no vertical space there, and PrimeVue's TabList
           offers only one slot, INSIDE role="tablist", where a button would be
           announced as a tab. Outside it, over it. -->
      <div class="tabs-wrap">
      <Tabs v-model:value="tab" lazy>
        <TabList>
          <Tab v-for="value in TAB_VALUES" :key="value" :value="value">{{ TAB_LABELS[value] }}</Tab>
        </TabList>
        <!-- On the strip's own line, right-aligned, so it costs no vertical
             space. A SIBLING of the tablist, not a child: PrimeVue's only
             TabList slot is inside role="tablist", where a button would be
             announced as a tab. -->
        <div class="tabs-csv">
          <Button
            icon="pi pi-download"
            label="Download CSV"
            text
            size="small"
            @click="onDownloadCsv"
          />
        </div>
        <TabPanels>
          <!-- Both panels render the same card; only the series, the layout and
               the scale note differ, so the markup is shared rather than
               duplicated. `lazy` on Tabs means only the active one mounts. -->
          <TabPanel v-for="value in TAB_VALUES" :key="value" :value="value">
            <!-- Only genuinely per-tab controls live here. Outcomes and
                 Categories have none; Detail has its category selector, which
                 is deliberately offered with no "all" option — every service at
                 once is the 130-cell table this tab exists to avoid. -->
            <div v-if="isDetail && detailOptions.length" class="panel-filters">
              <label for="detailCategory">Category</label>
              <Select
                inputId="detailCategory"
                v-model="detailCategory"
                :options="detailOptions"
                aria-label="Service category"
              />
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
              :emptyMessage="emptyMessage"
              @update:sort="onSortUpdate"
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
      </div>
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
.tabs-wrap { position: relative; }
/* Sits on the tab strip's own line, right-aligned. The strip's height is set by
   the tabs, so this costs nothing. */
.tabs-csv {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 1;
}
.view-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 1rem;
  margin-bottom: 1rem;
}
.scale-note {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted, #6b7280);
}
/* Pushes the export to the right edge, leaving the toggle and its note
   left-grouped — the same shape as VillageMetrics' controls bar. */
.pdf-button { margin-left: auto; }
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
