<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Dropdown from 'primevue/dropdown'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRoles } from '../../../shared/composables/useRoles.js'
import { getVillages, getVillageGrants, deleteVillageGrant } from '../api/villageGrantApi.js'

const router = useRouter()
const route = useRoute()
const { getRoleLabel, fetchRoles } = useRoles()
fetchRoles()

const selectedVillageId = ref(null)

const { state: villages, isLoading: villagesLoading } = useAsyncState(
  () => getVillages(),
  { immediate: true }
)

const { state: grants, isLoading: grantsLoading, execute: refetchGrants } = useAsyncState(
  () => selectedVillageId.value ? getVillageGrants(selectedVillageId.value) : Promise.resolve([]),
  { immediate: false }
)

onMounted(() => {
  // If returning from create grant with villageId in query, auto-select that village
  if (route.query.villageId) {
    selectedVillageId.value = route.query.villageId
    refetchGrants()
  }
})

const selectedVillage = computed(() => {
  return villages.value?.find(v => v.villageId === selectedVillageId.value)
})

const handleVillageChange = () => {
  if (selectedVillageId.value) {
    refetchGrants()
  }
}

const handleDeleteGrant = async (grantId) => {
  if (!selectedVillageId.value) return
  try {
    await deleteVillageGrant(selectedVillageId.value, grantId)
    await refetchGrants()
  } catch (err) {
    console.error('Failed to delete grant:', err)
  }
}

const handleCreateGrant = () => {
  router.push({
    name: 'admin-create-grant',
    params: { villageId: selectedVillageId.value }
  })
}

const displayGrants = computed(() => {
  if (!grants.value) return []

  return grants.value.map(grant => {
    if (grant.user) {
      return {
        grantId: grant.grantId,
        roleId: grant.roleId,
        roleLabel: getRoleLabel(grant.roleId),
        granteeType: 'user',
        granteeName: grant.user.displayName || grant.user.username,
        granteeId: grant.user.userId
      }
    } else if (grant.userGroup) {
      return {
        grantId: grant.grantId,
        roleId: grant.roleId,
        roleLabel: getRoleLabel(grant.roleId),
        granteeType: 'userGroup',
        granteeName: grant.userGroup.name,
        granteeId: grant.userGroup.userGroupId
      }
    }
  }).filter(Boolean)
})
</script>

<template>
  <div class="village-access-list">
    <h1>Village Access List</h1>

    <div class="village-selector">
      <label for="village-dropdown">Select Village:</label>
      <Dropdown
        id="village-dropdown"
        v-model="selectedVillageId"
        :options="villages"
        option-label="name"
        option-value="villageId"
        placeholder="-- Choose a village --"
        :disabled="villagesLoading"
        @change="handleVillageChange"
      />
    </div>

    <div v-if="selectedVillageId && grantsLoading" class="loading-state">
      <p>Loading grants...</p>
    </div>

    <div v-else-if="selectedVillageId" class="grants-section">
      <div class="grants-header">
        <h2>Grants for {{ selectedVillage?.name }}</h2>
        <Button
          label="+ Create Grant"
          @click="handleCreateGrant"
        />
      </div>

      <div v-if="displayGrants.length === 0" class="empty-state">
        <p>No grants found for this village</p>
      </div>

      <DataTable :value="displayGrants" class="grants-table-responsive">
        <Column field="granteeName" header="Grantee"></Column>
        <Column field="granteeType" header="Type">
          <template #body="slotProps">
            <Tag
              :value="slotProps.data.granteeType === 'user' ? 'User' : 'Group'"
              :severity="slotProps.data.granteeType === 'user' ? 'info' : 'success'"
            />
          </template>
        </Column>
        <Column field="roleLabel" header="Role"></Column>
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
.village-access-list {
  padding: 2rem;
}

h1 {
  margin: 0 0 2rem 0;
  color: var(--color-text-primary);
  font-size: 1.5rem;
}

.village-selector {
  margin-bottom: 2rem;
  display: flex;
  gap: 1rem;
  align-items: center;
}

.village-selector label {
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
  border-color: var(--p-primary-300);
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
  margin-bottom: 0rem;
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
  background-color: var(--p-primary-600);
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

.grants-table td {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.badge[data-type="user"] {
  background-color: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.badge[data-type="userGroup"] {
  background-color: rgba(34, 197, 94, 0.15);
  color: #4ade80;
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
    content: "Grantee";
    font-weight: 600;
    color: var(--color-text-primary);
    margin-right: 1rem;
  }

  :deep(.grants-table-responsive .p-datatable-tbody > tr > td:nth-child(2)::before) {
    content: "Type";
    font-weight: 600;
    color: var(--color-text-primary);
    margin-right: 1rem;
  }

  :deep(.grants-table-responsive .p-datatable-tbody > tr > td:nth-child(3)::before) {
    content: "Role";
    font-weight: 600;
    color: var(--color-text-primary);
    margin-right: 1rem;
  }

  :deep(.grants-table-responsive .p-datatable-tbody > tr > td:nth-child(4)::before) {
    content: "Actions";
    font-weight: 600;
    color: var(--color-text-primary);
    margin-right: 1rem;
  }
}

/* Stack when label + dropdown can't fit comfortably (~350px content) */
@media (max-width: 350px) {
  .village-selector {
    flex-direction: column;
    align-items: flex-start;
  }

  .dropdown {
    min-width: 100%;
  }
}

@media (max-width: 768px) {
  .village-access-list {
    padding: 1rem;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .btn-create {
    width: 100%;
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
