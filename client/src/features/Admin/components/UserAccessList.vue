<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Dropdown from 'primevue/dropdown'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRoleLabels } from '../../../shared/composables/useRoleLabels.js'
import { getUsers, getUserGrants, deleteUserGrant } from '../api/userGrantApi.js'

const router = useRouter()
const route = useRoute()
const { getRoleLabel } = useRoleLabels()

const selectedUserId = ref(null)
const sortBy = ref('village')
const sortDirection = ref('asc')

const { state: users, isLoading: usersLoading } = useAsyncState(
  () => getUsers(),
  { immediate: true }
)

const { state: grants, isLoading: grantsLoading, execute: refetchGrants } = useAsyncState(
  () => selectedUserId.value ? getUserGrants(selectedUserId.value) : Promise.resolve([]),
  { immediate: false }
)

onMounted(() => {
  if (route.query.userId) {
    selectedUserId.value = route.query.userId
    refetchGrants()
  }
})

const selectedUser = computed(() => {
  return users.value?.find(u => u.userId === selectedUserId.value)
})

const handleUserChange = () => {
  if (selectedUserId.value) {
    refetchGrants()
  }
}

const handleDeleteGrant = async (grantId) => {
  if (!selectedUserId.value) return
  try {
    await deleteUserGrant(selectedUserId.value, grantId)
    await refetchGrants()
  } catch (err) {
    console.error('Failed to delete grant:', err)
  }
}

const handleCreateGrant = () => {
  router.push({
    name: 'admin-create-user-grant',
    params: { userId: selectedUserId.value }
  })
}

const handleSort = (column) => {
  if (sortBy.value === column) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = column
    sortDirection.value = 'asc'
  }
}

const displayGrants = computed(() => {
  if (!grants.value) return []

  const mapped = grants.value.map(grant => ({
    grantId: grant.grantId,
    roleId: grant.roleId,
    roleLabel: getRoleLabel(grant.roleId),
    villageName: grant.village.name,
    villageId: grant.village.villageId
  }))

  const sorted = [...mapped].sort((a, b) => {
    let aVal, bVal

    if (sortBy.value === 'village') {
      aVal = a.villageName
      bVal = b.villageName
      return sortDirection.value === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    } else if (sortBy.value === 'role') {
      aVal = a.roleId
      bVal = b.roleId
      return sortDirection.value === 'asc' ? aVal - bVal : bVal - aVal
    }

    return 0
  })

  return sorted
})
</script>

<template>
  <div class="user-access-list">
    <h1>User Access List</h1>

    <div class="user-selector">
      <label for="user-dropdown">Select User:</label>
      <Dropdown
        id="user-dropdown"
        v-model="selectedUserId"
        :options="users"
        option-label="displayName"
        option-value="userId"
        :option-label-fn="(option) => option.displayName || option.username"
        placeholder="-- Choose a user --"
        :disabled="usersLoading"
        @change="handleUserChange"
      />
    </div>

    <div v-if="selectedUserId && grantsLoading" class="loading-state">
      <p>Loading grants...</p>
    </div>

    <div v-else-if="selectedUserId" class="grants-section">
      <div class="grants-header">
        <h2>Grants for {{ selectedUser?.displayName || selectedUser?.username }}</h2>
        <Button
          label="+ Create Grant"
          @click="handleCreateGrant"
        />
      </div>

      <div v-if="displayGrants.length === 0" class="empty-state">
        <p>No grants found for this user</p>
      </div>

      <DataTable
        :value="displayGrants"
        @sort="(event) => { sortBy = event.sortField; sortDirection = event.sortOrder === 1 ? 'asc' : 'desc' }"
        :sort-field="sortBy"
        :sort-order="sortDirection === 'asc' ? 1 : -1"
        class="grants-table-responsive"
      >
        <Column field="villageName" header="Village" sortable></Column>
        <Column field="roleLabel" header="Role" sortable :sort-function="(a, b) => a.roleId - b.roleId"></Column>
        <Column header="Actions" :exportable="false">
          <template #body="slotProps">
            <Button
              icon="pi pi-trash"
              severity="danger"
              size="small"
              @click="handleDeleteGrant(slotProps.data.grantId)"
              title="Delete grant"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.user-access-list {
  padding: 2rem;
}

h1 {
  margin: 0 0 2rem 0;
  color: var(--color-text-primary);
  font-size: 1.5rem;
}

.user-selector {
  margin-bottom: 2rem;
  display: flex;
  gap: 1rem;
  align-items: center;
}

.user-selector label {
  color: var(--color-text-primary);
  font-weight: 500;
}

.dropdown {
  padding: 0.5rem 0.75rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  color: var(--color-text-primary);
  font-size: 0.9rem;
  cursor: pointer;
  min-width: 300px;
}

.dropdown:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.dropdown:focus {
  outline: none;
  border-color: var(--color-primary-highlight-light);
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.1);
}

.loading-state {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-dim);
}

.grants-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.grants-header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.grants-header h2 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 1.25rem;
}

.btn-create {
  padding: 0.4rem 0.75rem;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.btn-create:hover {
  background-color: var(--color-primary-hover);
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-dim);
  font-style: italic;
}

.grants-table {
  width: 100%;
  border-collapse: collapse;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  overflow: hidden;
}

.grants-table thead {
  background-color: var(--color-background-dark);
}

.grants-table th {
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-default);
}

.grants-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.grants-table th.sortable:hover {
  background-color: var(--color-background-dark);
}

.sort-indicator {
  margin-left: 0.5rem;
  font-size: 0.75rem;
}

.grants-table td {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
}

.btn-delete {
  padding: 0.4rem 0.8rem;
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-delete:hover {
  background-color: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
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

/* Stack when label + dropdown can't fit comfortably (~350px content) */
@media (max-width: 350px) {
  .user-selector {
    flex-direction: column;
    align-items: flex-start;
  }

  .dropdown {
    min-width: 100%;
  }
}

@media (max-width: 768px) {
  .user-access-list {
    padding: 1rem;
  }

  .grants-table {
    font-size: 0.85rem;
  }

  .grants-table th,
  .grants-table td {
    padding: 0.75rem;
  }
}
</style>
