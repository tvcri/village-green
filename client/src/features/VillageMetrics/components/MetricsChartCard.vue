<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Chart from 'primevue/chart'
import Button from 'primevue/button'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { CHART_COLUMNS, chartCsvRows } from '../lib/metricsCsv.js'

const props = defineProps({
  slices: { type: Array, required: true }, // [{ label, value, color }]
  rows: { type: Array, required: true }, // [{ label, value, color, pct }] — pct is a fraction (0..1)
  emptyMessage: { type: String, required: true },
  // Empty string = no export control. Lets existing call sites stay untouched.
  csvFilename: { type: String, default: '' },
  // 'pie' | 'bar' — bar renders horizontally (indexAxis: 'y').
  chartType: { type: String, default: 'pie' },
})

defineOptions({ name: 'MetricsChartCard' })

const hasSlices = computed(() => props.slices.length > 0)

const isBar = computed(() => props.chartType === 'bar')

// Chart.js does not re-measure its container on a viewport resize here: a
// narrow-then-widen cycle (crossing the 640px stacking breakpoint) left the
// canvas at its stacked size until a tab switch remounted the component. Bar
// mode exposes this because its height comes from content; the pie's fixed
// 280px square hides it. Setting `responsive: true` did NOT fix it — the root
// cause was not pinned down, so this addresses the symptom directly: container
// geometry changes, chart re-measures.
//
// Not hypothetical — this is served over ngrok for customer demos on their own
// devices, where resizing is expected.
const chartHost = ref(null)
const chartRef = ref(null)
let resizeObserver = null

onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !chartHost.value) return
  resizeObserver = new ResizeObserver(() => {
    // getChart() is PrimeVue's accessor for the underlying Chart.js instance.
    // It is null until chart.js/auto finishes its dynamic import, so this is
    // optional-chained rather than assumed present.
    chartRef.value?.getChart()?.resize()
  })
  resizeObserver.observe(chartHost.value)
})

// The theme toggle adds/removes `app-dark` on <html> (see useTheme.js). That is
// invisible to Vue, so watching the attribute is what turns a theme change into
// a re-render of the chart's CSS-variable-derived colors.
let themeObserver = null

onMounted(() => {
  if (typeof MutationObserver === 'undefined') return
  themeObserver = new MutationObserver(() => { themeTick.value++ })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  themeObserver?.disconnect()
  themeObserver = null
})

// Bars need height proportional to their count — a fixed square would crush
// 10 service types. Pie keeps its CSS-driven square, so no inline style.
// The empty case has no bars to measure and falls back to the square's height
// so the empty message still has a box to sit in.
//
// 28 was chosen when this was only a floor that the desktop legend nearly
// always exceeded. Stacked on mobile there is no sibling to stretch against, so
// the floor became the actual height and 5 bars rendered 188px tall against a
// ~280px legend — visibly compressed. 44 is a band per bar, not the bar itself:
// Chart.js divides the height among the bars and draws each at a fraction of
// its band.
const BAR_THICKNESS = 44
const BAR_CHART_PADDING = 48
const EMPTY_HEIGHT = 280

// min-height, NOT height: the two card columns are flex siblings, so the
// default `align-items: stretch` already makes the chart as tall as the legend
// beside it — no measuring required. A fixed height would opt the chart OUT of
// that stretch, which is what previously left a 3-bar chart in a stub of a box
// next to a full-height table. The floor only bites the other way: when the bar
// count needs more room than the legend provides, it grows the row.
const chartStyle = computed(() => {
  if (!isBar.value) return {}
  const min = hasSlices.value
    ? props.slices.length * BAR_THICKNESS + BAR_CHART_PADDING
    : EMPTY_HEIGHT
  return { minHeight: `${min}px` }
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

// Chart.js has no theme awareness: its default grid is a fixed near-black at
// low alpha, which reads fine on the light card and all but vanishes on the
// dark one. Reading the app's own CSS variables keeps the axes in step with
// whatever the palette says rather than hardcoding a second set of hexes.
//
// Deliberately NOT via useTheme(): that composable touches localStorage and
// matchMedia at call time, which a presentational card has no business
// depending on — importing it broke every test in this file. The CSS variables
// already carry the theme, so reading them is enough.
//
// `themeTick` is what makes this reactive. The theme toggle swaps a class on
// <html>, which changes no Vue state, so a computed reading CSS variables would
// otherwise never re-evaluate.
const themeTick = ref(0)

function cssVar (name, fallback) {
  if (typeof getComputedStyle === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

const chartOptions = computed(() => {
  const bar = isBar.value
  // Read so a theme change re-runs this; by the time it fires the class swap
  // has happened and the variables below resolve to the new palette.
  void themeTick.value
  const gridColor = cssVar('--color-border-default', '#e4e4e7')
  const tickColor = cssVar('--color-text-dim', '#6b7280')
  return {
    // Explicit rather than relying on the default. NOTE: setting this alone did
    // NOT fix the stale-canvas-after-resize problem — the ResizeObserver in this
    // component is what actually does that. Kept because it is the correct value
    // to state, not because it is load-bearing.
    responsive: true,
    maintainAspectRatio: false,
    // Horizontal bars: categories down the y-axis, values along x.
    // The bar controller overrides Chart.js's default numeric animations (which
    // are pie/line-oriented: x, y, borderWidth, radius, tension), and the result
    // is that bars simply appear while the pie still sweeps. Animating `x`
    // explicitly from the axis origin restores a grow-in: each bar starts at
    // x=0 and eases out to its value. `from` is only applied on the initial
    // render (ctx.type === 'data' && ctx.mode === 'default'), so later updates
    // — a status filter change, a legs toggle — animate from their PREVIOUS
    // value rather than snapping back to zero first.
    ...(bar
      ? {
          indexAxis: 'y',
          animations: {
            x: {
              type: 'number',
              easing: 'easeOutQuart',
              duration: 1000,
              from: (ctx) => (ctx.type === 'data' && ctx.mode === 'default'
                ? ctx.chart.scales.x.getPixelForValue(0)
                : undefined),
            },
          },
          scales: {
            x: {
              ticks: { color: tickColor },
              grid: { color: gridColor },
            },
            y: {
              ticks: { color: tickColor },
              // No horizontal rules: with one bar per category they would just
              // underline each bar. The vertical value grid carries the reading.
              grid: { display: false },
            },
          },
        }
      : {}),
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
  downloadCsv(toCsv(chartCsvRows(props.rows), CHART_COLUMNS), props.csvFilename)
}
</script>

<template>
  <div class="chart-card" :class="{ 'bar-mode': isBar }">
    <div class="chart-container" :style="chartStyle" ref="chartHost">
      <Chart v-if="hasSlices" ref="chartRef" :type="chartType" :data="chartData" :options="chartOptions" />
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
.chart-card {
  display: flex;
  gap: 4.5rem;
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
  align-self: flex-end;
}

/* Container-owned sizing: if the canvas sizes its own wrapper, Chart.js reads back the
   shrunken size and the chart never re-expands after a viewport shrink (see b02e1ba0). */
.chart-container :deep(.p-chart) { width: 100%; height: 100%; }

/* Bar mode's container has min-height but no HEIGHT, and a percentage height
   resolves only against a DEFINITE one — min-height does not count. So the
   `height: 100%` above computed to auto, PrimeVue's .p-chart wrapper collapsed,
   and the canvas fell back to Chart.js's built-in 150px default. That is the
   150-inside-188 mismatch: not a squeeze, just the library default showing
   through because nothing upstream supplied a height.
   Flex stretch needs no definite parent height, so it fills where the
   percentage could not. min-height stays, which is what lets the desktop row
   still stretch the chart to the legend beside it.
   `display: flex` for this lives in the bar-mode rule below.

   NO TEST GUARDS THIS. vitest does not inject scoped styles into jsdom — the
   element carries a bare `chart-container` class with no style attached — so
   any assertion here would pass whether the rule exists or not. Deleting these
   two rules silently returns the canvas to 150px, visible only in a browser. */
.chart-card.bar-mode .chart-container :deep(.p-chart) {
  flex: 1 1 auto;
  /* Flex items floor at their content size; without this the wrapper refuses to
     shrink below the canvas and cannot stretch to fill either. */
  min-height: 0;
  height: auto;
}

/* Bar mode keeps the pie's side-by-side card; only the chart column's width
   rule differs. Bars were briefly given the full card width, but at desktop
   width (~1200px) that left the bars stretched across ~1000px with the legend
   stranded below and the right half of the card empty. 60/40 gives the bars
   more room than the pie's 280px square without wasting the remainder.
   Below 640px the shared media query stacks this exactly as it stacks a pie. */
.chart-card.bar-mode .chart-container {
  /* WIDTH, not flex-basis. Basis applies to the flex MAIN axis, and the 640px
     media query flips .chart-card to `column` — where basis means HEIGHT. A
     `flex: 0 1 480px` here silently became a 480px-tall box once stacked, which
     is what drew three bars 150px thick. Setting width keeps this rule about
     width at every viewport size. */
  flex: 0 1 auto;
  width: 480px;
  max-width: 100%;
  /* Makes the .p-chart wrapper a flex item so it can stretch to this box —
     see the percentage-vs-definite-height note above. */
  display: flex;
  /* No fixed height and no align-self: both would opt this column out of the
     flex row's default stretch, which is what matches the chart to the legend
     beside it. The inline style sets min-height only, so the chart grows past
     the legend when the bar count needs it and matches it otherwise. */
  height: auto;
  aspect-ratio: auto;
  align-self: stretch;
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

/* `container-type` sits on .chart-card, and an element can never match a query
   against the container IT establishes — so the old `@container` rule targeting
   .chart-card itself never applied and the card stayed side-by-side at every
   width. A media query is the honest tool here: the card spans the page, so
   viewport width and card width track each other anyway. */
@media (max-width: 640px) {
  .chart-card {
    flex-direction: column;
    /* `gap` applies along whichever axis the flex direction sets, so the 4.5rem
       that separates chart from legend side by side becomes 4.5rem of dead
       space BETWEEN them once stacked. Vertical stacking needs far less. */
    gap: 1rem;
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

  /* Bar mode must NOT take the square. Stacked, the container is as wide as the
     card, so aspect-ratio:1 makes it just as TALL — a ~1100px box that three
     bars then divide between them. Widening the window back reveals the result
     as absurdly fat bars, because the tall box is what the row inherited.
     Bar mode keeps its count-based min-height and lets content set the rest. */
  .chart-card.bar-mode .chart-container {
    aspect-ratio: auto;
    height: auto;
    align-self: stretch;
  }
}
</style>
