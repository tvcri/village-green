<script setup>
import { computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import ColumnGroup from 'primevue/columngroup'
import Row from 'primevue/row'
import Button from 'primevue/button'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { matrixColumns, matrixCells, matrixFooter } from '../lib/matrixTable.js'

const props = defineProps({
  rows: { type: Array, required: true },      // ALREADY ordered by the parent
  series: { type: Array, required: true },
  view: { type: String, required: true },     // 'counts' | 'share'
  sort: { type: String, required: true },
  dir: { type: String, required: true },      // 'asc' | 'desc'
  csvFilename: { type: String, required: true },
})

const emit = defineEmits(['update:sort'])

defineOptions({ name: 'MetaMatrixTable' })

const columns = computed(() => matrixColumns(props.series, props.view))
const cells = computed(() => matrixCells(props.rows, props.series, props.view))
const footer = computed(() => matrixFooter(props.rows, props.series, props.view))

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
      />
      <ColumnGroup type="footer">
        <Row>
          <Column
            v-for="(col, i) in columns"
            :key="col.key"
            :footer="String(footer[col.key])"
            :footerClass="i === 0 ? '' : 'num-cell'"
          />
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

.meta-matrix-table :deep(tfoot td) {
  font-weight: 700;
  border-top: 2px solid var(--color-border-default, #e5e7eb);
}
</style>
