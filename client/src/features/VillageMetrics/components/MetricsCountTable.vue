<script setup>
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { countColumns } from '../lib/metricsCsv.js'

const props = defineProps({
  rows: { type: Array, required: true },
  nameHeader: { type: String, required: true },
  // Empty string = no export control.
  csvFilename: { type: String, default: '' },
})

defineOptions({ name: 'MetricsCountTable' })

// Exports the complete row set — the PDF is the summary, the CSV is the record.
function onDownloadCsv () {
  downloadCsv(toCsv(props.rows, countColumns(props.nameHeader)), props.csvFilename)
}
</script>

<template>
  <div class="count-table-wrap">
    <div v-if="csvFilename" class="table-actions">
      <Button
        icon="pi pi-download"
        label="Download CSV"
        text
        size="small"
        @click="onDownloadCsv"
      />
    </div>
    <DataTable :value="rows" class="metrics-count-table">
      <template #empty>
        <span>No completed requests in this range.</span>
      </template>
      <Column field="fullName" :header="nameHeader" sortable />
      <Column field="count" header="Completed" sortable style="width: 8rem" bodyClass="count-cell" headerClass="count-cell" />
    </DataTable>
  </div>
</template>

<style scoped>
/* Numbers read better right-aligned against the column edge. */
.metrics-count-table :deep(.count-cell) {
  text-align: right;
}

.table-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.25rem;
}
</style>
