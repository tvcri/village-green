<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRoleLabels } from '../../../shared/composables/useRoleLabels.js'
import { getVillages, getVillageGrants, deleteVillageGrant } from '../api/villageGrantApi.js'

const router = useRouter()
const route = useRoute()
const { getRoleLabel } = useRoleLabels()

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

const handleVillageChange = (villageId) => {
  selectedVillageId.value = villageId
  if (villageId) {
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
      <select
        id="village-dropdown"
        :value="selectedVillageId"
        @change="handleVillageChange($event.target.value)"
        :disabled="villagesLoading"
        class="dropdown"
      >
        <option value="">-- Choose a village --</option>
        <option
          v-for="village in villages"
          :key="village.villageId"
          :value="village.villageId"
        >
          {{ village.name }}
        </option>
      </select>
    </div>

    <div v-if="selectedVillageId && grantsLoading" class="loading-state">
      <p>Loading grants...</p>
    </div>

    <div v-else-if="selectedVillageId" class="grants-section">
      <div class="grants-header">
        <h2>Grants for {{ selectedVillage?.name }}</h2>
        <button class="btn-create" @click="handleCreateGrant">
          + Create Grant
        </button>
      </div>

      <div v-if="displayGrants.length === 0" class="empty-state">
        <p>No grants found for this village</p>
      </div>

      <table v-else class="grants-table">
        <thead>
          <tr>
            <th>Grantee</th>
            <th>Type</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="grant in displayGrants" :key="grant.grantId">
            <td>{{ grant.granteeName }}</td>
            <td>
              <span class="badge" :data-type="grant.granteeType">
                {{ grant.granteeType === 'user' ? 'User' : 'Group' }}
              </span>
            </td>
            <td>{{ grant.roleLabel }}</td>
            <td>
              <button
                class="btn-delete"
                @click="handleDeleteGrant(grant.grantId)"
                title="Delete grant"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
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

@media (max-width: 768px) {
  .village-access-list {
    padding: 1rem;
  }

  .village-selector {
    flex-direction: column;
    align-items: flex-start;
  }

  .dropdown {
    min-width: 100%;
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
