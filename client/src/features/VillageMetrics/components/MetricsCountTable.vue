<script setup>
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'

defineProps({
  rows: { type: Array, required: true },
  nameHeader: { type: String, required: true },
})

defineOptions({ name: 'MetricsCountTable' })
</script>

<template>
  <DataTable :value="rows" class="metrics-count-table">
    <template #empty>
      <span>No completed requests in this range.</span>
    </template>
    <Column field="fullName" :header="nameHeader" sortable />
    <Column field="count" header="Completed" sortable style="width: 8rem" bodyClass="count-cell" headerClass="count-cell" />
  </DataTable>
</template>

<style scoped>
/* Numbers read better right-aligned against the column edge. */
.metrics-count-table :deep(.count-cell) {
  text-align: right;
}
</style>
