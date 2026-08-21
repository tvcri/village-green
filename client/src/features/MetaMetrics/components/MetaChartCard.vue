<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import Chart from 'primevue/chart'
import MetaMatrixTable from './MetaMatrixTable.vue'
import { chartHeight } from '../lib/chartConfig.js'

const props = defineProps({
  rows: { type: Array, required: true },       // ALREADY ordered
  series: { type: Array, required: true },
  view: { type: String, required: true },
  sort: { type: String, required: true },
  dir: { type: String, required: true },
  csvFilename: { type: String, required: true },
  chartData: { type: Object, required: true },
  chartOptions: { type: Object, required: true },
  emptyMessage: { type: String, default: 'No requests in this range' },
})

defineEmits(['update:sort'])

defineOptions({ name: 'MetaChartCard' })

const hasRows = computed(() => props.rows.length > 0)

// Height comes from the DATA, never from the table beside/below it — the series
// count differs per tab, so the chart's natural height and the table's row
// count diverge. See chartHeight()'s comment.
const chartBoxStyle = computed(() => ({
  height: `${chartHeight(props.rows.length, props.series.length)}px`,
}))

// Chart.js does not re-measure its container on a viewport resize here. Carried
// over from MetricsChartCard.vue — the page is served over ngrok for customer
// demos on their own devices, where resizing is expected.
const chartHost = ref(null)
const chartRef = ref(null)
let resizeObserver = null

onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !chartHost.value) return
  resizeObserver = new ResizeObserver(() => {
    // getChart() is null until chart.js/auto finishes its dynamic import.
    chartRef.value?.getChart()?.resize()
  })
  resizeObserver.observe(chartHost.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <section class="meta-chart-card">
    <!-- Chart above table, both full width. A deliberate divergence from
         VillageMetrics' side-by-side card: these are wider-than-usual
         comparisons and 13-village bars benefit from the full width.
         If this proves too wide, flipping .meta-chart-card to
         `flex-direction: row` and giving the two children widths is the whole
         change — which is why NEITHER child uses flex-basis. A `flex: 0 1 480px`
         silently becomes a 480px HEIGHT once the direction is column. -->
    <div class="chart-box" :style="chartBoxStyle" ref="chartHost">
      <Chart
        v-if="hasRows"
        ref="chartRef"
        type="bar"
        :data="chartData"
        :options="chartOptions"
      />
      <p v-else class="empty-msg">{{ emptyMessage }}</p>
    </div>

    <MetaMatrixTable
      :rows="rows"
      :series="series"
      :view="view"
      :sort="sort"
      :dir="dir"
      :csvFilename="csvFilename"
      @update:sort="$emit('update:sort', $event)"
    />
  </section>
</template>

<style scoped>
.meta-chart-card {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  background: var(--color-background-light);
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  padding: 1.25rem 1.5rem 1.5rem;
  min-width: 0;
}

/* WIDTH, never flex-basis — basis follows the main axis, and this card's
   direction is the one thing a layout change would flip. */
.chart-box {
  position: relative;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

/* REQUIRED. Without it PrimeVue's wrapper collapses to its intrinsic size and
   Chart.js ignores the sized parent — 13 villages rendered into ~100px with 3px
   bars and most labels dropped. This was a live defect in the previous version
   of this file.
   NO TEST GUARDS THIS: vitest injects no scoped styles into jsdom, so an
   assertion would pass whether the rule exists or not. Deleting it is visible
   only in a browser. */
.chart-box :deep(.p-chart) { width: 100%; height: 100%; }

.empty-msg {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  margin: 0;
  color: var(--color-text-muted, #6b7280);
}

@media (max-width: 640px) {
  .meta-chart-card { padding: 1rem; }
}
</style>
