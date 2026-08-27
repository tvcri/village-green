<script setup>
import { computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { matrixColumns, matrixCells, matrixFooter } from '../lib/matrixTable.js'
import { barSegments } from '../lib/barGeometry.js'

const props = defineProps({
  rows: { type: Array, required: true },      // ALREADY ordered by the parent
  series: { type: Array, required: true },
  view: { type: String, required: true },     // 'counts' | 'percent'
  sort: { type: String, required: true },
  dir: { type: String, required: true },      // 'asc' | 'desc'
  dark: { type: Boolean, default: false },
})

const emit = defineEmits(['update:sort'])

defineOptions({ name: 'MetaMatrixTable' })

const columns = computed(() => matrixColumns(props.series, props.view))
const footer = computed(() => matrixFooter(props.rows, props.series, props.view))

// The totals line is the FIRST row of the table, by customer request. PrimeVue
// renders a ColumnGroup footer into <tfoot> and offers no header-side
// equivalent, so the line rides in the body as an ordinary row instead, styled
// back into a totals line by the .totals-row rule below.
//
// Prepended AFTER the parent has sorted `rows`, which is what pins it: a click
// on any column reorders the villages beneath it and never moves it. It carries
// a `villageId` of null so `dataKey` stays unique and it cannot collide with a
// real village.
const TOTALS_ROW_ID = null
const cells = computed(() => [
  { ...footer.value, villageId: TOTALS_ROW_ID },
  ...matrixCells(props.rows, props.series, props.view),
])

function isTotalsRow (data) {
  return data.villageId === TOTALS_ROW_ID
}

// PrimeVue applies this per rendered row; it is what makes the pinned first row
// read as a totals line rather than a village called "All Villages".
function rowClass (data) {
  return isTotalsRow(data) ? 'totals-row' : null
}

// The totals line gets a bar in SHARE view only.
//
// In share every track is full width by construction (barGeometry.js), so the
// hub-wide bar is exactly as long as every village bar above which it sits and
// reads as what it is: the same partition, taken over every village at once.
// There is no scale to mistake.
//
// In counts the track carries magnitude, scaled against the busiest VILLAGE.
// The hub total is the sum of all of them, so its bar would either overflow the
// track or silently rescale every other row against a denominator no village
// owns. It stays suppressed there — that was the original objection, and it is
// a counts-view objection specifically.
//
// Built from raw sums rather than from `footer`, whose share-view values are
// preformatted strings ('64.0%'). Passing the row alone makes it its own
// denominator, which is what a share bar wants.
const totalsBar = computed(() => {
  if (props.view !== 'percent') return null
  const raw = { total: 0 }
  for (const s of props.series) raw[s.key] = 0
  for (const row of props.rows) {
    raw.total += row.total
    for (const s of props.series) raw[s.key] += row[s.key]
  }
  const { segments, trackPct } = barSegments([raw], props.series, props.view)
  return { segments: segments[0], trackPct: trackPct[0] }
})

// Each series column header carries the same swatch color as the bar segments
// drawn in that column's rows — there is no chart and no separate legend, so
// this pairing is what names the colors. Village and Total/Requests are not
// series, so they get none.
// Keyed off `series[].key` rather than column index — index math (skip first
// and last) would silently mis-swatch if a column were ever reordered.
function swatchColor (colKey) {
  const s = props.series.find(s => s.key === colKey)
  return s ? (props.dark ? s.colorDark : s.colorLight) : null
}

// DataTable never sorts for itself: it reports the click and the parent
// recomputes the one ordered list this table renders. `:sortField`/`:sortOrder`
// are bound so the header arrows reflect the parent's state. `lazy` is the load-bearing prop here —
// PrimeVue's `processedData` unconditionally re-sorts `value` by `sortField`
// whenever `lazy` is false (verified in primevue/datatable/index.mjs); `lazy`
// is the only switch that makes it render `value` as given.
function onSort (event) {
  emit('update:sort', {
    sort: event.sortField,
    dir: event.sortOrder === -1 ? 'desc' : 'asc',
  })
}

const sortOrder = computed(() => (props.dir === 'desc' ? -1 : 1))

// The bar lives in the same ROW as its numbers, which is the whole reason this
// page has no chart. Keyed by villageId rather than row index so the bar cannot
// drift from its row if PrimeVue ever renders out of order.
// Every tab stacks, in both views: each series set partitions its row, so the
// segments are always parts of one whole. Only the track's length changes with
// the view — see barGeometry.js.
const barsById = computed(() => {
  const { segments, trackPct } = barSegments(
    props.rows, props.series, props.view,
  )
  return new Map(props.rows.map((row, i) => [
    row.villageId,
    { segments: segments[i], trackPct: trackPct[i] },
  ]))
})

function barFor (villageId) {
  return barsById.value.get(villageId) ?? { segments: [], trackPct: 0 }
}

// A counts bar is shortened to carry its village's share of the busiest total;
// in percent every track is full width, which barSegments already returns.
function trackStyle (villageId) {
  return { width: `${barFor(villageId).trackPct}%` }
}

function segColor (seg) {
  return props.dark ? seg.colorDark : seg.colorLight
}

// Native title attribute rather than a tooltip library: the numbers are already
// on screen in the same row, so this is a convenience, not the primary reading.
function segTitle (seg) {
  return `${seg.label}: ${seg.value}`
}

</script>

<template>
  <div class="matrix-wrap">
    <DataTable
      :value="cells"
      lazy
      :sortField="sort"
      :sortOrder="sortOrder"
      @sort="onSort"
      dataKey="villageId"
      :rowClass="rowClass"
      class="meta-matrix-table"
    >
      <Column
        v-for="(col, i) in columns"
        :key="col.key"
        :field="col.key"
        :header="col.header"
        sortable
        :bodyClass="i === 0 ? 'name-cell' : 'num-cell'"
        :headerClass="i === 0 ? 'name-cell' : 'num-cell'"
      >
        <template v-if="swatchColor(col.key)" #header>
          <span class="swatch" :style="{ backgroundColor: swatchColor(col.key) }" />
        </template>
        <!-- Only the name column needs a body template: the title attribute is
             what keeps an ellipsis-truncated village name readable. Every other
             column renders its field value as usual. -->
        <template v-if="i === 0" #body="{ data }">
          <span :title="isTotalsRow(data) ? null : data.villageName">{{ data.villageName }}</span>
        </template>
      </Column>

      <!-- The bar column. Not sortable and not exported: it is a rendering of
           the numbers in the same row, not a value of its own. -->
      <Column headerClass="bar-head" bodyClass="bar-cell">
        <template #body="{ data }">
          <!-- One composed bar, on every tab and in both views. The series
               partition the row — three terminal fates, or the categories of a
               village's work — so the segments genuinely are parts of a whole.
               In counts the track's LENGTH carries the row total.
               The totals row draws a bar in SHARE view only, where every track
               is full width so it cannot be mis-scaled against the rows below
               it; in counts its magnitude has no shared denominator and it
               draws none. See totalsBar above. -->
          <div
            v-if="!isTotalsRow(data)"
            class="bar-track"
            :style="trackStyle(data.villageId)"
          >
            <span
              v-for="seg in barFor(data.villageId).segments"
              :key="seg.key"
              class="bar-seg"
              :style="{ width: `${seg.width}%`, backgroundColor: segColor(seg) }"
              :title="segTitle(seg)"
            />
          </div>
          <div
            v-else-if="totalsBar"
            class="bar-track"
            :style="{ width: `${totalsBar.trackPct}%` }"
          >
            <span
              v-for="seg in totalsBar.segments"
              :key="seg.key"
              class="bar-seg"
              :style="{ width: `${seg.width}%`, backgroundColor: segColor(seg) }"
              :title="segTitle(seg)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.matrix-wrap { min-width: 0; overflow-x: auto; }

/* Without explicit widths these columns are auto-sized from their content and
   header text, and the village name loses that negotiation — "Aquidneck Island"
   and "Bristol-Warren" wrapped to two lines while the percentage columns sat on
   ~100px of surplus. Sizing the numeric columns to what they actually hold
   returns that width to the names.
   Numbers right-align so magnitudes line up column-wise; the name does not. */
.meta-matrix-table :deep(.num-cell) {
  width: 6.5rem;
  text-align: right;
}

/* 11rem clears the longest name in the roster ("Aquidneck Island", 16 chars)
   with room to spare. Names are hand-entered into a varchar(200), so an
   unusually long one ellipsis-truncates rather than wrapping or widening the
   table — the full name stays available via the title attribute. */
.meta-matrix-table :deep(.name-cell) {
  width: 11rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 11rem;
}

/* text-align alone does NOT right-align a sortable header. PrimeVue wraps the
   header's label + sort icon in a flex container, and its justify-content wins
   over the th's text-align — so the body cells right-aligned while the headers
   stayed left, putting each header visually above the PREVIOUS column's
   numbers. Justify the flex container instead. */
.meta-matrix-table :deep(th.num-cell .p-datatable-column-header-content) {
  justify-content: flex-end;
}

/* The totals line, now the first BODY row rather than a <tfoot>. The 2px rule
   moves to the bottom edge so it still separates the total from the villages —
   the separator belongs between the two, and the line changed sides when the
   row did. */
.meta-matrix-table :deep(tr.totals-row > td) {
  font-weight: 700;
  border-bottom: 2px solid var(--color-border-default, #e5e7eb);
}

/* PrimeVue's row hover/stripe would make the totals line read as one of the
   selectable village rows beneath it. */
.meta-matrix-table :deep(tr.totals-row:hover > td) {
  background: transparent;
}

/* The bar column takes the leftover width so the numeric columns keep their
   natural size. Extra left padding separates the bar from the Total figure. */
.meta-matrix-table :deep(td.bar-cell),
.meta-matrix-table :deep(th.bar-head) {
  width: 100%;
  padding-left: 1.15rem;
}

/* PrimeVue's bodyCell padding is 0.75rem top and bottom — 24px of the row's
   height spent on whitespace, which is what kept the three grouped bars thin.
   Trimming it in THIS cell only lets the bars grow without changing the
   vertical rhythm of the text columns beside them. */
.meta-matrix-table :deep(td.bar-cell) {
  padding-top: 0.3rem;
  padding-bottom: 0.3rem;
}

.bar-track {
  display: flex;
}

/* One composed bar per row. 27px was chosen to match the total height of the
   three 9px bars an earlier grouped layout drew, so the table's vertical
   rhythm did not change when Outcomes moved to a stack.
   The width comes from trackStyle(): full in percent, scaled to the busiest
   village's total in counts. */
.bar-track {
  flex-direction: row;
  align-items: center;
  height: 27px;
  /* A 1px gap keeps adjacent segments distinguishable where one is a sliver;
     without it a 1px orange against a 1px purple reads as a single 2px mark. */
  gap: 1px;
}

.bar-track .bar-seg { height: 27px; }

/* NO border-radius. Rounding every segment was wrong in stacked bars: it landed
   on whichever segment happened to be last, so the rounding moved between rows
   as the data changed — visible when a village had zero Unmatched. */
.bar-seg { display: inline-block; }

.swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 2px;
  margin-right: 0.35rem;
  vertical-align: middle;
}
</style>
