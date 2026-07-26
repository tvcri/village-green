<!-- client/src/features/VillageMetrics/components/VillageMetrics.vue -->
<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Chart from 'primevue/chart'
import { getVillageMetrics } from '../api/villageMetricsApi.js'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRefetchOnChange } from '../../../shared/composables/useRefetchOnChange.js'
import { useCurrentUser } from '../../../shared/composables/useCurrentUser.js'
import { presetRange, isValidRange } from '../lib/rangePresets.js'
import { dateToServiceDate } from '../../../shared/lib/civilDate.js'
import MetricsRangePicker from './MetricsRangePicker.vue'
import MetricsCountTable from './MetricsCountTable.vue'

defineOptions({ name: 'VillageMetrics' })

const route = useRoute()
const router = useRouter()
const { hasPermission } = useCurrentUser()

// "today" as a civil string — reading the clock is allowed; parsing a stored value is not.
const todayCivil = dateToServiceDate(new Date())

const villageId = computed(() => String(route.params.villageId))
const range = computed(() => ({ start: route.query.start, end: route.query.end }))

// Normalize the URL to a valid range (default = this-year) whenever it is missing/invalid.
function normalizeRange () {
  if (!isValidRange(range.value)) {
    const def = presetRange('thisYear', todayCivil)
    router.replace({ query: { start: def.start, end: def.end } })
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

// Refetch on any villageId or range (route.query) change. `range` is a computed
// over route.query, so this fires exactly when start/end actually change — not on
// unrelated re-renders. It does NOT fire on initial mount (watch is lazy by default).
useRefetchOnChange([villageId, range], fetchIfValid)

// The single mount trigger. onMounted fires once; fetchIfValid either executes
// (valid query) or router.replaces the default — and that replace changes route.query,
// which the useRefetchOnChange watcher above then picks up to run the one real fetch.
// Net: exactly one fetch on entry (no double-fetch, no replace loop, because a valid
// range makes normalizeRange a no-op that returns true).
onMounted(() => fetchIfValid())

function onRangeUpdate ({ start, end }) {
  router.replace({ query: { start, end } })
}

// ---- chart configs ----
const STATUS_LABELS = {
  draft: 'Draft', open: 'Open', confirmed: 'Confirmed', completed: 'Completed',
  unmatched: 'Unmatched', memberCancelled: 'Member cancelled', volunteerCancelled: 'Volunteer cancelled',
}
const STATUS_ORDER = ['draft', 'open', 'confirmed', 'completed', 'unmatched', 'memberCancelled', 'volunteerCancelled']

const statusChartData = computed(() => {
  const by = metrics.value?.totals?.byStatus
  if (!by) return null
  return {
    labels: STATUS_ORDER.map(k => `${STATUS_LABELS[k]} (${by[k]})`),
    datasets: [{
      label: 'Requests',
      backgroundColor: '#3B82F6',
      borderColor: '#1E40AF',
      borderWidth: 1,
      data: STATUS_ORDER.map(k => by[k]),
    }],
  }
})

const statusChartOptions = {
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false, // height owned by .status-chart; canvas-driven sizing never re-expands
  plugins: { legend: { display: false } },
  scales: { x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } },
}

const serviceTypeChartData = computed(() => {
  const arr = metrics.value?.byServiceType
  if (!arr) return null
  return {
    labels: arr.map(r => r.serviceName), // full name; truncated in the tick callback
    datasets: [{
      label: 'Completed',
      backgroundColor: '#10B981',
      borderColor: '#047857',
      borderWidth: 1,
      data: arr.map(r => r.count),
    }],
  }
})

// Height scales with row count (~28px/bar) so long lists stay readable.
const serviceTypeChartHeight = computed(() => {
  const n = metrics.value?.byServiceType?.length ?? 0
  return Math.max(160, n * 28 + 60) // px; floor keeps a short list from collapsing
})

const serviceTypeChartOptions = {
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false, // height driven by the container (serviceTypeChartHeight)
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: { title: (items) => items[0]?.label ?? '' } }, // full name on hover
  },
  scales: {
    x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
    y: {
      ticks: {
        callback (value) {
          // `this.getLabelForValue` yields the full serviceName; truncate the axis tick.
          const label = this.getLabelForValue(value)
          return label.length > 28 ? label.slice(0, 27) + '…' : label
        },
      },
    },
  },
}

const hasData = computed(() => !!metrics.value)
const noServiceTypes = computed(() => hasData.value && metrics.value.byServiceType.length === 0)

const canSeeMembers = computed(() => hasPermission('member:read', villageId.value))
const canSeeVolunteers = computed(() => hasPermission('volunteer:read', villageId.value))
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
      <section class="metrics-section">
        <h2>Totals</h2>
        <p class="headline">{{ metrics.totals.totalRequests }} requests in range</p>
        <div class="chart-container status-chart">
          <Chart type="bar" :data="statusChartData" :options="statusChartOptions" />
        </div>
      </section>

      <section class="metrics-section">
        <h2>By service type</h2>
        <p class="caption">Completed requests only.</p>
        <p v-if="noServiceTypes" class="empty-msg">No completed requests in this range.</p>
        <div v-else class="chart-container" :style="{ height: serviceTypeChartHeight + 'px' }">
          <Chart type="bar" :data="serviceTypeChartData" :options="serviceTypeChartOptions" />
        </div>
      </section>

      <div class="people-grid">
        <section class="metrics-section">
          <h2>By member</h2>
          <p class="caption">Completed requests only.</p>
          <MetricsCountTable
            :rows="metrics.byMember"
            nameHeader="Member"
            :villageId="villageId"
            :linkRouteName="canSeeMembers ? 'member-detail' : null"
          />
        </section>
        <section class="metrics-section">
          <h2>By volunteer</h2>
          <p class="caption">Completed requests only.</p>
          <MetricsCountTable
            :rows="metrics.byVolunteer"
            nameHeader="Volunteer"
            :villageId="villageId"
            :linkRouteName="canSeeVolunteers ? 'volunteer-detail' : null"
          />
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.village-metrics { padding: 1rem 1.5rem; }
.metrics-header { margin-bottom: 1.5rem; }
.exclusion-note { color: var(--color-text-muted, #6b7280); font-size: 0.85rem; margin: 0.25rem 0 1rem; }
.metrics-section { margin-bottom: 2rem; }
.headline { font-size: 1.5rem; font-weight: 600; margin: 0.5rem 0 1rem; }
.caption { color: var(--color-text-muted, #6b7280); font-size: 0.85rem; margin: 0 0 0.5rem; }
.empty-msg { color: var(--color-text-muted, #6b7280); }
.chart-container {
  background: var(--color-background-light, #fff);
  border: 1px solid var(--color-border-default, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  max-width: 720px;
}
/* The container must own both dimensions and the chart must fill it: if the
   canvas sizes its own wrapper, Chart.js reads back the shrunken size and the
   chart never re-expands after a viewport shrink. */
.chart-container :deep(.p-chart) { width: 100%; height: 100%; }
.status-chart { height: 400px; }
.people-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}
.loading-state { padding: 2rem; }
</style>
