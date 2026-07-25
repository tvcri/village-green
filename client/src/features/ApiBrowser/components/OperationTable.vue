<script setup>
import { computed, ref } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Tag from 'primevue/tag'

const props = defineProps({
  rows: { type: Array, required: true },
  selectedOperationId: { type: String, default: '' },
})
const emit = defineEmits(['select'])

const filters = ref({ global: { value: null, matchMode: 'contains' } })

// Single source of truth is the parent's selectedOperationId — look up the
// row object PrimeVue needs for its `selection` prop rather than tracking a
// second, parallel piece of selection state in this component.
const selection = computed(() =>
  props.rows.find(row => row.operationId === props.selectedOperationId) ?? null
)

function onRowSelect(event) {
  emit('select', event.data.operationId)
}

// With `selection` bound, PrimeVue fires row-unselect when the user clicks
// the row that is already selected (its default toggle behavior). Re-clicking
// the selected operation is almost always the user re-focusing it, not asking
// to clear it — and emitting `select` here would be a no-op anyway (parent's
// operationId ref already holds this value), while emitting nothing keeps the
// row highlighted instead of flashing unselected. Deliberately swallow it.
function onRowUnselect() {}
</script>

<template>
  <div class="operation-table">
    <div class="table-toolbar">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText v-model="filters.global.value" placeholder="Filter operations..." />
      </IconField>
      <span class="table-meta">{{ rows.length }} operations</span>
    </div>
    <DataTable
      :value="rows"
      v-model:filters="filters"
      :selection="selection"
      :global-filter-fields="['path', 'operationId', 'summary', 'tag']"
      selection-mode="single"
      data-key="operationId"
      sort-mode="single"
      removable-sort
      scrollable
      scroll-height="flex"
      size="small"
      striped-rows
      @row-select="onRowSelect"
      @row-unselect="onRowUnselect"
    >
      <Column field="method" header="Method" sortable style="width: 6rem">
        <template #body="{ data }">
          <Tag :value="data.method" severity="info" />
        </template>
      </Column>
      <Column field="tag" header="Tag" sortable style="width: 11rem" />
      <Column field="path" header="Path" sortable />
      <Column field="operationId" header="operationId" sortable />
      <Column field="summary" header="Summary" />
      <Column field="paramCount" header="Params" sortable style="width: 6rem" />
      <template #empty>No operations match the filter.</template>
    </DataTable>
  </div>
</template>

<style scoped>
.operation-table {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.table-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 0.5rem;
}
.table-meta {
  color: var(--color-text-dim);
  font-size: 0.85rem;
}
.operation-table :deep(.p-datatable) {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
