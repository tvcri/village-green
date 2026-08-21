<script setup>
import { computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import ColumnGroup from 'primevue/columngroup'
import Row from 'primevue/row'
import Button from 'primevue/button'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { matrixColumns, matrixCells, matrixFooter } from '../lib/matrixTable.js'
import { barSegments, BAR_TRACK_PX } from '../lib/barGeometry.js'

const props = defineProps({
  rows: { type: Array, required: true },      // ALREADY ordered by the parent
  series: { type: Array, required: true },
  view: { type: String, required: true },     // 'counts' | 'share'
  sort: { type: String, required: true },
  dir: { type: String, required: true },      // 'asc' | 'desc'
  csvFilename: { type: String, required: true },
  dark: { type: Boolean, default: false },
})

const emit = defineEmits(['update:sort'])

defineOptions({ name: 'MetaMatrixTable' })

const columns = computed(() => matrixColumns(props.series, props.view))
const cells = computed(() => matrixCells(props.rows, props.series, props.view))
const footer = computed(() => matrixFooter(props.rows, props.series, props.view))

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
const segmentsById = computed(() => {
  const all = barSegments(props.rows, props.series, props.view)
  return new Map(props.rows.map((row, i) => [row.villageId, all[i]]))
})

function segmentsFor (villageId) {
  return segmentsById.value.get(villageId) ?? []
}

function segColor (seg) {
  return props.dark ? seg.colorDark : seg.colorLight
}

// Native title attribute rather than a tooltip library: the numbers are already
// on screen in the same row, so this is a convenience, not the primary reading.
function segTitle (seg) {
  return `${seg.label}: ${seg.value}`
}

const trackWidth = `${BAR_TRACK_PX}px`

function onDownloadCsv () {
  downloadCsv(toCsv(cells.value, columns.value), props.csvFilename)
}
</script>

<template>
  <div class="matrix-wrap">
    <div class="table-actions">
      <Button icon="pi pi-download" label="Download CSV" text size="small" @click="onDownloadCsv" />
    </div>
    <DataTable
      :value="cells"
      lazy
      :sortField="sort"
      :sortOrder="sortOrder"
      @sort="onSort"
      dataKey="villageId"
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
          <span :title="data.villageName">{{ data.villageName }}</span>
        </template>
      </Column>

      <!-- The bar column. Not sortable and not exported: it is a rendering of
           the numbers in the same row, not a value of its own. -->
      <Column headerClass="bar-head" bodyClass="bar-cell">
        <template #body="{ data }">
          <!-- Counts GROUPS: three thin bars stacked vertically, sharing one
               scale. The three outcomes are independent quantities that do not
               compose into a whole — an unmatched request is not part of the
               same pile as a completed one — so butting them end to end would
               assert a total that means nothing. Share STACKS, because there
               the segments genuinely are parts of 100%. -->
          <div
            :class="['bar-track', view === 'share' ? 'is-stacked' : 'is-grouped']"
            :style="view === 'share' ? null : { width: trackWidth }"
          >
            <span
              v-for="seg in segmentsFor(data.villageId)"
              :key="seg.key"
              class="bar-seg"
              :style="{ width: `${seg.width}${seg.unit}`, backgroundColor: segColor(seg) }"
              :title="segTitle(seg)"
            />
          </div>
        </template>
      </Column>

      <ColumnGroup type="footer">
        <Row>
          <Column
            v-for="(col, i) in columns"
            :key="col.key"
            :footer="String(footer[col.key])"
            :footerClass="i === 0 ? 'name-cell' : 'num-cell'"
          />
          <!-- Matches the bar column so the footer's cells stay aligned with
               the body's. Deliberately empty: a hub-wide bar would invite
               reading it against the per-village bars, which are on a
               different scale. -->
          <Column />
        </Row>
      </ColumnGroup>
    </DataTable>
  </div>
</template>

<style scoped>
.matrix-wrap { min-width: 0; overflow-x: auto; }

.table-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.25rem;
}

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

.meta-matrix-table :deep(tfoot td) {
  font-weight: 700;
  border-top: 2px solid var(--color-border-default, #e5e7eb);
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

/* Counts: one thin bar per outcome, stacked vertically and left-aligned so all
   three start from a common zero. Modelled on the two-bar rows in the
   ri-senate district report (page 4). */
.bar-track.is-grouped {
  flex-direction: column;
  align-items: flex-start;
  /* NO gap. Colour and the shared left edge already separate the three bars, so
     whitespace between them is redundant — and spending it on thickness is what
     makes them read as bars rather than rules. Abutting is how the paired bars
     in the ri-senate report carry their weight at this row height. */
  gap: 0;
}

.bar-track.is-grouped .bar-seg { height: 9px; }

/* Share: a single composed bar matching the grouped stack's total height
   (3 x 9px), so switching views does not change the table's vertical rhythm. */
/* Fills the cell rather than a fixed track: a share bar asserts "this is the
   whole of this village", and one that visibly stops short of its container
   undercuts exactly that. Counts keeps the fixed px track because ITS lengths
   must be comparable across rows against a shared maximum. */
.bar-track.is-stacked {
  flex-direction: row;
  align-items: center;
  width: 100%;
  height: 27px;
  /* A 1px gap keeps adjacent segments distinguishable where one is a sliver;
     without it a 1px orange against a 1px purple reads as a single 2px mark. */
  gap: 1px;
}

.bar-track.is-stacked .bar-seg { height: 27px; }

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
