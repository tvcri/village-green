<script setup>
import { computed } from 'vue'
import Chart from 'primevue/chart'
import Button from 'primevue/button'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { PIE_COLUMNS, pieCsvRows } from '../lib/metricsCsv.js'

const props = defineProps({
  slices: { type: Array, required: true }, // [{ label, value, color }]
  rows: { type: Array, required: true }, // [{ label, value, color, pct }] — pct is a fraction (0..1)
  emptyMessage: { type: String, required: true },
  // Empty string = no export control. Lets existing call sites stay untouched.
  csvFilename: { type: String, default: '' },
  // 'pie' | 'bar' — bar renders horizontally (indexAxis: 'y').
  chartType: { type: String, default: 'pie' },
})

defineOptions({ name: 'MetricsPieCard' })

const hasSlices = computed(() => props.slices.length > 0)

const isBar = computed(() => props.chartType === 'bar')

// Bars need height proportional to their count — a fixed square would crush
// 10 service types. Pie keeps its CSS-driven square, so no inline style.
// The empty case has no bars to measure and falls back to the square's height
// so the empty message still has a box to sit in.
const BAR_THICKNESS = 28
const BAR_CHART_PADDING = 48
const EMPTY_HEIGHT = 280

const chartStyle = computed(() => {
  if (!isBar.value) return {}
  const height = hasSlices.value
    ? props.slices.length * BAR_THICKNESS + BAR_CHART_PADDING
    : EMPTY_HEIGHT
  return { height: `${height}px` }
})

const chartData = computed(() => ({
  labels: props.slices.map(s => s.label),
  datasets: [{
    data: props.slices.map(s => s.value),
    backgroundColor: props.slices.map(s => s.color),
  }],
}))

// Legend plugin is off — the rows table to the right is the legend. Tooltip
// carries label + value + pct since that identity/detail pairing isn't on the chart itself.
// No `animation` key: Chart.js's defaults (1000ms, easeOutQuart) apply. Note
// `animation: true` is NOT a supported value — it replaces the default config
// OBJECT with a boolean, leaving no duration, so the pie appears with no sweep.
// Only `false` (disable) or a config object are meaningful here.

// Shared by both modes. `parsed` is a number for a pie but an object for a
// bar, so the value is extracted by the caller.
function tooltipLabel (context, value) {
  const total = context.dataset.data.reduce((sum, v) => sum + v, 0)
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return `${context.label}: ${value} (${pct}%)`
}

const chartOptions = computed(() => {
  const bar = isBar.value
  return {
    maintainAspectRatio: false,
    // Horizontal bars: categories down the y-axis, values along x.
    ...(bar ? { indexAxis: 'y' } : {}),
    // Chart.js defaults arc borders to 2px of #fff. That white is load-bearing in
    // light theme — it's what separates adjacent slices, including the 3-4%
    // slivers a Services pie produces — so it stays, just thinner. At 2px it read
    // as heavy white lines against the dark theme's near-black card.
    elements: { arc: { borderWidth: 1 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label (context) {
            return tooltipLabel(context, bar ? context.parsed.x : context.parsed)
          },
        },
      },
    },
  }
})

function formatPct (pct) {
  return `${Math.round(pct * 100)}%`
}

// Sums the rendered rows, matching the PDF's legend Total (see `legend` in
// metricsPdf.js). Rows are what's displayed — Services merges its tail into
// "Other" and the legs toggle adjusts values, so summing rows keeps the
// on-screen total consistent with the rows above it.
const totalValue = computed(() => props.rows.reduce((sum, r) => sum + r.value, 0))

function onDownloadCsv () {
  downloadCsv(toCsv(pieCsvRows(props.rows), PIE_COLUMNS), props.csvFilename)
}
</script>

<template>
  <div class="pie-card" :class="{ 'bar-mode': isBar }">
    <div class="chart-container" :style="chartStyle">
      <Chart v-if="hasSlices" :type="chartType" :data="chartData" :options="chartOptions" />
      <p v-else class="empty-msg">{{ emptyMessage }}</p>
    </div>
    <div class="legend-table-wrap">
      <div v-if="csvFilename" class="legend-actions">
        <Button
          icon="pi pi-download"
          label="Download CSV"
          text
          size="small"
          @click="onDownloadCsv"
        />
      </div>
      <table class="legend-table">
        <thead>
          <tr>
            <th class="swatch-col" />
            <th>Label</th>
            <th>Value</th>
            <th>Pct</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.label">
            <td class="swatch-col"><span class="swatch" :style="{ backgroundColor: row.color }" /></td>
            <td>{{ row.label }}</td>
            <td>{{ row.value }}</td>
            <td>{{ formatPct(row.pct) }}</td>
          </tr>
        </tbody>
        <tfoot v-if="rows.length">
          <tr>
            <td class="swatch-col" />
            <td>Total</td>
            <td>{{ totalValue }}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped>
.pie-card {
  display: flex;
  gap: 1.5rem;
  min-width: 0;
}

/* `flex: 0 0 280px` here was a hard 280px floor: on a 320-390px viewport the
   chart plus the legend beside it forced the document wider than the screen.
   Shrinking is allowed now, with the 280px kept as a max rather than a floor. */
.chart-container {
  flex: 0 1 280px;
  width: 100%;
  max-width: 280px;
  height: 280px;
  min-width: 0;
}

/* Container-owned sizing: if the canvas sizes its own wrapper, Chart.js reads back the
   shrunken size and the chart never re-expands after a viewport shrink (see b02e1ba0). */
.chart-container :deep(.p-chart) { width: 100%; height: 100%; }

/* Bar mode keeps the pie's side-by-side card; only the chart column's width
   rule differs. Bars were briefly given the full card width, but at desktop
   width (~1200px) that left the bars stretched across ~1000px with the legend
   stranded below and the right half of the card empty. 60/40 gives the bars
   more room than the pie's 280px square without wasting the remainder.
   Below 640px the shared media query stacks this exactly as it stacks a pie. */
.pie-card.bar-mode .chart-container {
  flex: 1 1 60%;
  max-width: none;
  /* height set inline (scales with bar count); aspect-ratio must not fight it */
  aspect-ratio: auto;
}

.empty-msg {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  margin: 0;
  color: var(--color-text-muted, #6b7280);
  text-align: center;
}

.legend-table-wrap {
  flex: 1 1 auto;
  min-width: 0;
  max-height: 22rem; /* scrolls past ~10 rows instead of stretching the card */
  overflow-y: auto;
  /* Long service-type labels can still out-width a phone. Scrolling the table
     inside its own box keeps that overflow local instead of widening the
     document — which is what was shearing the Value/Pct columns off-screen. */
  overflow-x: auto;
}

.legend-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.25rem;
}

.legend-table {
  width: 100%;
  border-collapse: collapse;
}

.legend-table th {
  text-align: left;
  color: var(--color-text-muted, #6b7280);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--color-border-default, #e5e7eb);
}

.legend-table td {
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--color-border-default, #e5e7eb);
}

/* Mirrors the PDF legend: one rule separating the data from the Total, and no
   bottom border under it. Sticky so the total stays visible when a long
   Services legend scrolls inside .legend-table-wrap. */
.legend-table tfoot td {
  position: sticky;
  bottom: 0;
  /* Must be opaque: rows scroll UNDER this cell. --color-background-light is
     theme-aware (style.css defines a dark override); the undefined
     --color-surface-default this replaces fell through to #fff and painted a
     white bar across the dark theme. */
  background: var(--color-background-light, #fff);
  border-top: 1px solid var(--color-border-default, #e5e7eb);
  border-bottom: none;
  font-weight: 600;
  padding: 0.35rem 0.5rem;
}

.swatch-col {
  width: 1.5rem;
}

.swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 2px;
}

/* `container-type` sits on .pie-card, and an element can never match a query
   against the container IT establishes — so the old `@container` rule targeting
   .pie-card itself never applied and the card stayed side-by-side at every
   width. A media query is the honest tool here: the card spans the page, so
   viewport width and card width track each other anyway. */
@media (max-width: 640px) {
  .pie-card {
    flex-direction: column;
  }

  /* Centred once stacked — a left-aligned pie under a full-width table reads as
     misaligned rather than deliberate. */
  .chart-container {
    align-self: center;
    /* Keep the square: with the row constraint gone, height must follow the
       (now smaller) width or the pie sits in a letterboxed box. */
    height: auto;
    aspect-ratio: 1;
  }
}
</style>
