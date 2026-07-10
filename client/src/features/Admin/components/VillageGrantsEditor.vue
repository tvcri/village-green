<script setup>
import { computed, ref } from 'vue'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import { useRoles } from '../../../shared/composables/useRoles.js'

const props = defineProps({
  rows: { type: Array, required: true },
  availableVillages: { type: Array, required: true },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['add', 'delete'])

// Parent is responsible for having called fetchRoles(); the module-level
// cache in useRoles makes this a shared read.
const { villageRoles } = useRoles()

const sortBy = ref('village')
const sortDirection = ref('asc')
const pendingGrant = ref(null)

const handleCreateGrant = () => { pendingGrant.value = { villageId: null, roleId: null } }
const handleCancelGrant = () => { pendingGrant.value = null }
const handleSaveGrant = () => {
  if (!pendingGrant.value?.villageId || !pendingGrant.value?.roleId) return
  emit('add', {
    villageId: pendingGrant.value.villageId,
    roleId: parseInt(pendingGrant.value.roleId, 10),
  })
}
const clearPending = () => { pendingGrant.value = null }
defineExpose({ clearPending })

const sortedRows = computed(() => {
  const sorted = [...props.rows].sort((a, b) => {
    if (sortBy.value === 'village') {
      return sortDirection.value === 'asc'
        ? a.villageName.localeCompare(b.villageName)
        : b.villageName.localeCompare(a.villageName)
    }
    if (sortBy.value === 'role') {
      return sortDirection.value === 'asc' ? a.roleId - b.roleId : b.roleId - a.roleId
    }
    return 0
  })
  return sorted
})

const PENDING_ROW_KEY = '__pending__'
const tableRows = computed(() => {
  if (!pendingGrant.value) return sortedRows.value
  return [{ grantId: PENDING_ROW_KEY }, ...sortedRows.value]
})
const isPendingRow = (data) => data.grantId === PENDING_ROW_KEY

const sortVillageName = (a, b) => {
  if (isPendingRow(a)) return -1
  if (isPendingRow(b)) return 1
  return sortDirection.value === 'asc' ? a.villageName.localeCompare(b.villageName) : b.villageName.localeCompare(a.villageName)
}
const sortRoleId = (a, b) => {
  if (isPendingRow(a)) return -1
  if (isPendingRow(b)) return 1
  return sortDirection.value === 'asc' ? a.roleId - b.roleId : b.roleId - a.roleId
}
</script>

<template>
  <div class="village-grants-editor">
    <div class="editor-header">
      <h2>Village Grants</h2>
      <Button label="+ Add Grant" :disabled="!!pendingGrant || busy" @click="handleCreateGrant" />
    </div>

    <div v-if="rows.length === 0 && !pendingGrant" class="empty-state">
      <p>No village grants</p>
    </div>

    <DataTable
      v-else
      :value="tableRows"
      @sort="(event) => { sortBy = event.sortField; sortDirection = event.sortOrder === 1 ? 'asc' : 'desc' }"
      :sort-field="sortBy"
      :sort-order="sortDirection === 'asc' ? 1 : -1"
      class="grants-table-responsive"
    >
      <Column field="villageName" header="Village" sortable :sort-function="sortVillageName">
        <template #body="{ data }">
          <Select
            v-if="isPendingRow(data)"
            v-model="pendingGrant.villageId"
            :options="availableVillages"
            option-label="name"
            option-value="villageId"
            placeholder="-- Village --"
            class="village-select"
          />
          <template v-else>{{ data.villageName }}</template>
        </template>
      </Column>
      <Column field="roleLabel" header="Role" sortable :sort-function="sortRoleId">
        <template #body="{ data }">
          <Select
            v-if="isPendingRow(data)"
            v-model="pendingGrant.roleId"
            :options="villageRoles"
            option-label="name"
            option-value="roleId"
            placeholder="-- Role --"
            class="role-select"
          />
          <template v-else>{{ data.roleLabel }}</template>
        </template>
      </Column>
      <Column header="Actions" :exportable="false">
        <template #body="{ data }">
          <div v-if="isPendingRow(data)" class="row-actions">
            <Button
              icon="pi pi-check"
              severity="success"
              size="small"
              :disabled="!pendingGrant.villageId || !pendingGrant.roleId || busy"
              @click="handleSaveGrant"
              title="Save grant"
            />
            <Button
              icon="pi pi-times"
              severity="secondary"
              size="small"
              :disabled="busy"
              @click="handleCancelGrant"
              title="Cancel"
            />
          </div>
          <Button
            v-else
            icon="pi pi-trash"
            severity="danger"
            size="small"
            :disabled="busy"
            @click="emit('delete', data.grantId)"
            title="Delete grant"
          />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.village-grants-editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.editor-header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 1rem;
}

.editor-header h2 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 1.25rem;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-dim);
  font-style: italic;
}

.grants-table-responsive {
  box-shadow: var(--box-shadow-card);
  border: 1px solid var(--color-border-default);
}

.village-select,
.role-select {
  min-width: 180px;
}

.row-actions {
  display: flex;
  gap: 0.5rem;
}

@media (max-width: 375px) {
  :deep(.grants-table-responsive .p-datatable-thead) {
    display: none;
  }

  :deep(.grants-table-responsive .p-datatable-tbody > tr) {
    display: flex;
    flex-direction: column;
    margin-bottom: 1rem;
    border: 1px solid var(--color-border-default);
    border-radius: 6px;
    padding: 1rem;
  }

  :deep(.grants-table-responsive .p-datatable-tbody > tr > td) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0;
    border: none;
  }

  :deep(.grants-table-responsive .p-datatable-tbody > tr > td:nth-child(1)::before) {
    content: "Village";
    font-weight: 600;
    color: var(--color-text-primary);
    margin-right: 1rem;
  }

  :deep(.grants-table-responsive .p-datatable-tbody > tr > td:nth-child(2)::before) {
    content: "Role";
    font-weight: 600;
    color: var(--color-text-primary);
    margin-right: 1rem;
  }

  :deep(.grants-table-responsive .p-datatable-tbody > tr > td:nth-child(3)::before) {
    content: "Actions";
    font-weight: 600;
    color: var(--color-text-primary);
    margin-right: 1rem;
  }
}
</style>
