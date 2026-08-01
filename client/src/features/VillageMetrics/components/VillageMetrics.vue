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
import SelectButton from 'primevue/selectbutton'
import SplitButton from 'primevue/splitbutton'
import { capturePie } from '../lib/capturePies.js'
import { buildMetricsPdf, chartDrawHeight, chartSlotWidth } from '../lib/metricsPdf.js'
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
import { csvFilename } from '../lib/metricsCsv.js'
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

// ---- chart type (URL-backed) ----
const CHART_TYPE_OPTIONS = [
  { label: 'Pie', value: 'pie' },
  { label: 'Bar', value: 'bar' },
]
const CHART_TYPE_VALUES = CHART_TYPE_OPTIONS.map(o => o.value)

// Same shape as `tab` above: ?chart= is read when present and valid, and a
// fresh visit falls back to the 'pie' default exactly as a fresh visit falls
// back to the Categories tab and the this-year range. Being in the URL means a
// reload keeps the choice and a link can be shared already in bar mode.
// Unknown values fall back rather than writing a correction, so ?chart=banana
// renders sanely without an extra history entry.
const chartType = computed({
  get: () => (CHART_TYPE_VALUES.includes(route.query.chart) ? route.query.chart : 'pie'),
  set: (value) => {
    if (!CHART_TYPE_VALUES.includes(value)) return
    router.replace({ query: { ...route.query, chart: value } })
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

// Filenames carry the filter state because the contents do: without it, four
// downloads at different statuses all collide as one name in Downloads.
function nameFor (table, state) {
  return csvFilename({
    villageName: metrics.value?.villageName || 'village',
    table,
    state,
    start: range.value.start,
    end: range.value.end,
  })
}

const categoryCsvName = computed(() => nameFor('categories', catStatus.value))
const serviceCsvName = computed(() => nameFor('services', svcStatus.value))
const outcomesCsvName = computed(() => nameFor('outcomes', ''))
const memberCsvName = computed(() => nameFor('members', ''))
const volunteerCsvName = computed(() => nameFor('volunteers', ''))

// ---- PDF export ----
// No spinner: a measured export runs ~200ms, where a spinner would only flash.
// The disabled button plus a changed label is enough, and it also prevents the
// double-click-two-PDFs race.
const isExporting = ref(false)

// Chart.js is loaded on demand so the export path costs nothing until used.
async function chartDeps () {
  const { default: Chart } = await import('chart.js/auto')
  return {
    createCanvas: (w, h = w) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      return c
    },
    createChart: (canvas, cfg) => new Chart(canvas, cfg),
  }
}

// Captures render at 3x the PDF's point size so the raster holds up in print.
// The canvas MUST have the same proportions as the box it is drawn into: a bar
// capture at the pie's default square width but a taller height gets squashed
// horizontally by pdf-lib to fit. So both dimensions derive from the PDF's own
// measurements — chartSlotWidth() for width, chartDrawHeight() for height.
const CAPTURE_SCALE = 3

function captureFor (view, deps) {
  const sized = chartType.value === 'bar'
    ? {
        ...deps,
        size: chartSlotWidth('bar') * CAPTURE_SCALE,
        // Must match the height drawPieSection will draw it at, or pdf-lib
        // stretches the raster to fit.
        height: chartDrawHeight(view.slices.length, 'bar') * CAPTURE_SCALE,
      }
    : deps
  return capturePie(view.slices, sized, chartType.value)
}

async function onDownloadPdf () {
  isExporting.value = true
  try {
    const deps = await chartDeps()
    const images = {
      categories: captureFor(categoryView.value, deps),
      services: captureFor(serviceView.value, deps),
      outcomes: captureFor(outcomesView.value, deps),
    }

    const bytes = await buildMetricsPdf({
      villageName: metrics.value?.villageName || 'Village',
      start: range.value.start,
      end: range.value.end,
      legs: legs.value,
      strip: strip.value,
      images,
      // chartType and sliceCount ride along on each view so drawPieSection can
      // size the image the same way the capture did. sliceCount is the BAR
      // count, which differs from rows.length: Services merges its tail into a
      // single "Other" slice while the legend lists every row.
      views: {
        categories: { rows: categoryView.value.rows, sliceCount: categoryView.value.slices.length, status: catStatus.value, emptyMessage: categoryView.value.emptyMessage, chartType: chartType.value },
        services: { rows: serviceView.value.rows, sliceCount: serviceView.value.slices.length, status: svcStatus.value, category: svcCategory.value, emptyMessage: serviceView.value.emptyMessage, chartType: chartType.value },
        outcomes: { rows: outcomesView.value.rows, sliceCount: outcomesView.value.slices.length, emptyMessage: outcomesView.value.emptyMessage, chartType: chartType.value },
      },
      people: { members: memberRows.value, volunteers: volunteerRows.value },
    })

    saveBlob(new Blob([bytes], { type: 'application/pdf' }), pdfName.value)
  } finally {
    isExporting.value = false
  }
}

// Shared by the PDF and JSON downloads. The CSV path uses downloadCsv() from
// csvUtils.js instead — it owns its own text/csv Blob and the same anchor dance.
function saveBlob (blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Reuses csvFilename's slug + range construction, swapping the extension —
// so PDF, JSON and the five CSVs all carry the same village/range identity.
function exportName (ext) {
  return csvFilename({
    villageName: metrics.value?.villageName || 'village',
    table: 'metrics',
    state: '',
    start: range.value.start,
    end: range.value.end,
  }).replace(/\.csv$/, ext)
}

const pdfName = computed(() => exportName('.pdf'))
const jsonName = computed(() => exportName('.json'))

// The RAW API response, deliberately unfiltered: no status/category selection
// and no legs doubling, because those are client-side interpretations of this
// payload rather than part of it. The five CSVs cover the filtered views.
function onDownloadJson () {
  if (!metrics.value) return
  const json = JSON.stringify(metrics.value, null, 2)
  saveBlob(new Blob([json], { type: 'application/json' }), jsonName.value)
}

const exportMenuItems = computed(() => [
  {
    label: 'Download JSON',
    icon: 'pi pi-code',
    command: onDownloadJson,
  },
])

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

      <div class="controls-bar">
        <div class="view-controls">
          <SelectButton
            v-model="chartType"
            :options="CHART_TYPE_OPTIONS"
            optionLabel="label"
            optionValue="value"
            :allowEmpty="false"
            aria-label="Chart type"
          />
          <div class="legs-toggle">
            <ToggleSwitch v-model="legs" inputId="legsToggle" />
            <label for="legsToggle">Round trip = 2 legs</label>
          </div>

        </div>

        <SplitButton
          icon="pi pi-file-pdf"
          :label="isExporting ? 'Preparing…' : 'Download PDF'"
          :disabled="isExporting"
          :model="exportMenuItems"
          @click="onDownloadPdf"
        />
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
            <MetricsPieCard v-bind="categoryView" :csvFilename="categoryCsvName" :chartType="chartType" />
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
            <MetricsPieCard v-bind="serviceView" :csvFilename="serviceCsvName" :chartType="chartType" />
          </TabPanel>

          <TabPanel value="outcomes">
            <MetricsPieCard v-bind="outcomesView" :csvFilename="outcomesCsvName" :chartType="chartType" />
          </TabPanel>

          <TabPanel value="people">
            <div class="people-grid">
              <section class="metrics-section">
                <h2>By member</h2>
                <p class="caption">Completed requests only.</p>
                <MetricsCountTable :rows="memberRows" nameHeader="Member" :csvFilename="memberCsvName" />
              </section>
              <section class="metrics-section">
                <h2>By volunteer</h2>
                <p class="caption">Completed requests only.</p>
                <MetricsCountTable :rows="volunteerRows" nameHeader="Volunteer" :csvFilename="volunteerCsvName" />
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
/* Toggle left, Download PDF right, on one row. Wraps to two rows on narrow
   viewports rather than crushing the toggle label. */
.controls-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  margin-bottom: 1rem;
}
/* Groups the two view controls on the left so space-between pushes only the
   export button right. Wraps rather than crushing on a narrow viewport. */
.view-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
}
.legs-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
/* `minmax(320px, ...)` is a hard floor: on a 320-390px viewport the 320px track
   plus the page's own horizontal padding overflowed the screen. min() lets the
   track collapse to the available width on a phone while still giving two
   columns the moment there is room for them. */
.people-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
  gap: 1.5rem;
}
.loading-state { padding: 2rem; }

@media (max-width: 640px) {
  /* 1.5rem each side is a meaningful slice of a 320px screen; the content needs
     it back more than the page needs the gutter. */
  .village-metrics { padding: 1rem 0.75rem; }

  /* Each filter gets its own line: label above control, control full-width,
     rather than four items competing for one row. */
  .panel-filters { flex-direction: column; align-items: stretch; gap: 0.5rem; }
  .panel-filters :deep(.p-select) { width: 100%; }
}
</style>
