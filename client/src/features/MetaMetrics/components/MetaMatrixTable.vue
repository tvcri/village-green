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

// The chart above must render the SAME order, so DataTable never sorts for
// itself: it reports the click and the parent recomputes one ordered list that
// both children consume. `:sortField`/`:sortOrder` are bound so the header
// arrows reflect the parent's state. `lazy` is the load-bearing prop here —
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
        :bodyClass="i === 0 ? '' : 'num-cell'"
        :headerClass="i === 0 ? '' : 'num-cell'"
      >
        <template v-if="swatchColor(col.key)" #header>
          <span class="swatch" :style="{ backgroundColor: swatchColor(col.key) }" />
        </template>
      </Column>

      <!-- The bar column. Not sortable and not exported: it is a rendering of
           the numbers in the same row, not a value of its own. -->
      <Column headerClass="bar-head" bodyClass="bar-cell">
        <template #body="{ data }">
          <div class="bar-track" :style="{ width: trackWidth }">
            <span
              v-for="seg in segmentsFor(data.villageId)"
              :key="seg.key"
              class="bar-seg"
              :style="{ width: `${seg.width}px`, backgroundColor: segColor(seg) }"
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
            :footerClass="i === 0 ? '' : 'num-cell'"
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

/* Numbers right-align so magnitudes line up column-wise; the village name does not. */
.meta-matrix-table :deep(.num-cell) { text-align: right; }

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

.bar-track {
  display: flex;
  align-items: center;
  height: 11px;
  /* A 1px gap keeps adjacent segments distinguishable where one is a sliver;
     without it a 1px orange against a 1px purple reads as a single 2px mark. */
  gap: 1px;
}

/* NO border-radius. Rounding every segment was wrong in stacked bars: it landed
   on whichever segment happened to be last, so the rounding moved between rows
   as the data changed — visible when a village had zero Unmatched. */
.bar-seg {
  display: inline-block;
  height: 11px;
}

.swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 2px;
  margin-right: 0.35rem;
  vertical-align: middle;
}
</style>
