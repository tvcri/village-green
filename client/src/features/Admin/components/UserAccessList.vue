<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRoles } from '../../../shared/composables/useRoles.js'
import { getVillages } from '../api/villageGrantApi.js'
import { getUsers, getUserGrants, deleteUserGrant, createUserGrant } from '../api/userGrantApi.js'
import { updateUser } from '../../../shared/api/userApi.js'
import { extractApiErrorMessage } from '../lib/userAdminHelpers.js'

const route = useRoute()
const { roles, getRoleLabel, fetchRoles } = useRoles()
fetchRoles()

const selectedUserId = ref(null)
const sortBy = ref('village')
const sortDirection = ref('asc')
const pendingGrant = ref(null)
const isSavingGrant = ref(false)
const isEditingUsername = ref(false)
const usernameDraft = ref('')
const isSavingUsername = ref(false)
const usernameError = ref('')

const { state: users } = useAsyncState(
  () => getUsers(),
  { immediate: true }
)

const { state: villages } = useAsyncState(
  () => getVillages(),
  { immediate: true }
)

const { state: grants, isLoading: grantsLoading, execute: refetchGrants } = useAsyncState(
  () => selectedUserId.value ? getUserGrants(selectedUserId.value) : Promise.resolve([]),
  { immediate: false }
)

onMounted(() => {
  selectedUserId.value = route.params.userId
  refetchGrants()
})

const selectedUser = computed(() => {
  return users.value?.find(u => u.userId === selectedUserId.value)
})

const handleEditUsername = () => {
  usernameDraft.value = selectedUser.value?.username || ''
  usernameError.value = ''
  isEditingUsername.value = true
}

const handleCancelUsername = () => {
  isEditingUsername.value = false
  usernameError.value = ''
}

const handleSaveUsername = async () => {
  const trimmed = usernameDraft.value.trim()
  if (!trimmed || trimmed === selectedUser.value?.username) {
    isEditingUsername.value = false
    return
  }

  isSavingUsername.value = true
  usernameError.value = ''
  try {
    const updated = await updateUser(selectedUserId.value, { username: trimmed })
    const index = users.value.findIndex(u => u.userId === selectedUserId.value)
    if (index !== -1) {
      users.value[index] = { ...users.value[index], ...updated }
    }
    isEditingUsername.value = false
  } catch (err) {
    usernameError.value = extractApiErrorMessage(err, 'Failed to rename user.')
  } finally {
    isSavingUsername.value = false
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
  pendingGrant.value = { villageId: null, roleId: null }
}

const handleCancelGrant = () => {
  pendingGrant.value = null
}

const handleSaveGrant = async () => {
  if (!pendingGrant.value?.villageId || !pendingGrant.value?.roleId) return

  isSavingGrant.value = true
  try {
    await createUserGrant(selectedUserId.value, [{
      villageId: pendingGrant.value.villageId,
      roleId: parseInt(pendingGrant.value.roleId, 10)
    }])
    await refetchGrants()
    pendingGrant.value = null
  } catch (err) {
    console.error('Failed to create grant:', err)
  } finally {
    isSavingGrant.value = false
  }
}

const grantedVillageIds = computed(() => {
  if (!grants.value) return new Set()
  return new Set(grants.value.filter(g => g.village).map(g => g.village.villageId))
})

const availableVillages = computed(() => {
  return (villages.value || []).filter(v => !grantedVillageIds.value.has(v.villageId))
})

const displayGrants = computed(() => {
  if (!grants.value) return []

  const mapped = grants.value.map(grant => ({
    grantId: grant.grantId,
    roleId: grant.roleId,
    roleLabel: getRoleLabel(grant.roleId),
    villageName: grant.village ? grant.village.name : 'Federation',
    villageId: grant.village ? grant.village.villageId : null
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

const PENDING_ROW_KEY = '__pending__'

const tableRows = computed(() => {
  if (!pendingGrant.value) return displayGrants.value
  return [{ grantId: PENDING_ROW_KEY }, ...displayGrants.value]
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
  <div class="user-access-list">
    <h1>User Access List</h1>

    <div v-if="selectedUserId && grantsLoading" class="loading-state">
      <p>Loading grants...</p>
    </div>

    <div v-else-if="selectedUserId" class="grants-section">
      <div class="grants-header">
        <div v-if="isEditingUsername" class="username-edit">
          <InputText v-model="usernameDraft" autofocus :disabled="isSavingUsername" @keyup.enter="handleSaveUsername" @keyup.escape="handleCancelUsername" />
          <Button
            icon="pi pi-check"
            severity="success"
            size="small"
            :disabled="!usernameDraft.trim() || isSavingUsername"
            @click="handleSaveUsername"
            title="Save username"
          />
          <Button
            icon="pi pi-times"
            severity="secondary"
            size="small"
            :disabled="isSavingUsername"
            @click="handleCancelUsername"
            title="Cancel"
          />
          <small v-if="usernameError" class="field-error">{{ usernameError }}</small>
        </div>
        <h2 v-else>
          Grants for {{ selectedUser?.username }}
          <Button
            icon="pi pi-pencil"
            text
            rounded
            size="small"
            @click="handleEditUsername"
            title="Edit username"
          />
        </h2>
        <Button
          label="+ Create Grant"
          :disabled="!!pendingGrant"
          @click="handleCreateGrant"
        />
      </div>

      <div v-if="displayGrants.length === 0 && !pendingGrant" class="empty-state">
        <p>No grants found for this user</p>
      </div>

      <DataTable
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
              :options="roles"
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
                :disabled="!pendingGrant.villageId || !pendingGrant.roleId || isSavingGrant"
                @click="handleSaveGrant"
                title="Save grant"
              />
              <Button
                icon="pi pi-times"
                severity="secondary"
                size="small"
                :disabled="isSavingGrant"
                @click="handleCancelGrant"
                title="Cancel"
              />
            </div>
            <Button
              v-else
              icon="pi pi-trash"
              severity="danger"
              size="small"
              @click="handleDeleteGrant(data.grantId)"
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

.loading-state {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-dim);
}

.grants-table-responsive {
  box-shadow: var(--box-shadow-card);
  border: 1px solid var(--color-border-default);
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
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.username-edit {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.username-edit :deep(.p-inputtext) {
  width: 320px;
  max-width: 100%;
}

.field-error {
  color: var(--color-text-error);
  font-size: 0.8rem;
  width: 100%;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-dim);
  font-style: italic;
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

@media (max-width: 768px) {
  .user-access-list {
    padding: 1rem;
  }
}
</style>
