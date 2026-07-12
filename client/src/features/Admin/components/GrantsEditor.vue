<script setup>
import { computed, ref } from 'vue'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import { useRoles } from '../../../shared/composables/useRoles.js'
import { HUB_SCOPE, availableRoles, scopeOptions } from '../lib/grantDisplayHelpers.js'

const props = defineProps({
  rows: { type: Array, required: true },
  villages: { type: Array, required: true },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['add', 'delete'])

// Parent is responsible for having called fetchRoles(); the module-level
// cache in useRoles makes this a shared read.
const { villageRoles, federationRoles } = useRoles()

const sortBy = ref('scope')
const sortDirection = ref('asc')
const pendingGrant = ref(null)

const handleCreateGrant = () => { pendingGrant.value = { scope: null, roleIds: [] } }
const handleCancelGrant = () => { pendingGrant.value = null }
// Roles are scope-specific: changing scope invalidates any checked roles.
const handleScopeChange = () => { pendingGrant.value.roleIds = [] }
const handleSaveGrant = () => {
  if (pendingGrant.value?.scope == null || pendingGrant.value.roleIds.length === 0) return
  emit('add', {
    villageId: pendingGrant.value.scope === HUB_SCOPE ? null : pendingGrant.value.scope,
    roleIds: pendingGrant.value.roleIds.map(Number),
  })
}
const clearPending = () => { pendingGrant.value = null }
defineExpose({ clearPending })

const scopeOpts = computed(() => scopeOptions(props.villages))
const roleOpts = computed(() => availableRoles({
  scopeValue: pendingGrant.value?.scope ?? null,
  federationRoles: federationRoles.value,
  villageRoles: villageRoles.value,
  rows: props.rows,
}))

// Hub rows sort before village rows; villages alphabetical.
const scopeRank = (row) => (row.isHub ? '0' : `1${row.scopeLabel}`)

const PENDING_ROW_KEY = '__pending__'
const isPendingRow = (data) => data.grantId === PENDING_ROW_KEY

const tableRows = computed(() => {
  const sorted = [...props.rows].sort((a, b) => {
    const cmp = sortBy.value === 'role'
      ? a.roleId - b.roleId
      : scopeRank(a).localeCompare(scopeRank(b))
    return sortDirection.value === 'asc' ? cmp : -cmp
  })
  if (!pendingGrant.value) return sorted
  return [{ grantId: PENDING_ROW_KEY }, ...sorted]
})

const sortScope = (a, b) => {
  if (isPendingRow(a)) return -1
  if (isPendingRow(b)) return 1
  const cmp = scopeRank(a).localeCompare(scopeRank(b))
  return sortDirection.value === 'asc' ? cmp : -cmp
}
const sortRoleId = (a, b) => {
  if (isPendingRow(a)) return -1
  if (isPendingRow(b)) return 1
  return sortDirection.value === 'asc' ? a.roleId - b.roleId : b.roleId - a.roleId
}
</script>

<template>
  <div class="grants-editor">
    <div class="editor-header">
      <h2>Grants</h2>
      <Button label="+ Add Grant" :disabled="!!pendingGrant || busy" @click="handleCreateGrant" />
    </div>

    <div v-if="rows.length === 0 && !pendingGrant" class="empty-state">
      <p>No grants</p>
    </div>

    <DataTable
      v-else
      :value="tableRows"
      @sort="(event) => { sortBy = event.sortField; sortDirection = event.sortOrder === 1 ? 'asc' : 'desc' }"
      :sort-field="sortBy"
      :sort-order="sortDirection === 'asc' ? 1 : -1"
      class="grants-table-responsive"
    >
      <Column field="scope" header="Scope" sortable :sort-function="sortScope">
        <template #body="{ data }">
          <Select
            v-if="isPendingRow(data)"
            v-model="pendingGrant.scope"
            :options="scopeOpts"
            option-label="label"
            option-value="value"
            placeholder="-- Hub or Village --"
            class="scope-select"
            @change="handleScopeChange"
          />
          <template v-else>{{ data.scopeLabel }}</template>
        </template>
      </Column>
      <Column field="role" header="Role" sortable :sort-function="sortRoleId">
        <template #body="{ data }">
          <MultiSelect
            v-if="isPendingRow(data)"
            v-model="pendingGrant.roleIds"
            :options="roleOpts"
            option-label="name"
            option-value="roleId"
            display="chip"
            :disabled="pendingGrant.scope == null"
            placeholder="-- Roles --"
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
              :disabled="pendingGrant.scope == null || pendingGrant.roleIds.length === 0 || busy"
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
            @click="emit('delete', data)"
            title="Delete grant"
          />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.grants-editor {
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

.scope-select,
.role-select {
  min-width: 180px;
  max-width: 320px;
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
    content: "Scope";
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
