<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRoleLabels } from '../../../shared/composables/useRoleLabels.js'
import { getVillages } from '../api/villageGrantApi.js'
import { createUser } from '../../../shared/api/userApi.js'
import { extractApiErrorMessage } from '../lib/userAdminHelpers.js'

const router = useRouter()
const { getRoleLabel, getRoles } = useRoleLabels()
const roles = getRoles()

const { state: villages } = useAsyncState(() => getVillages(), { immediate: true })

const username = ref('')
const firstName = ref('')
const lastName = ref('')
const grants = ref([])
const pendingGrant = ref(null)

const isSubmitting = ref(false)
const usernameError = ref('')
const formError = ref('')

const sortBy = ref('village')
const sortDirection = ref('asc')

let nextGrantId = 0

const handleCreateGrant = () => {
  pendingGrant.value = { villageId: null, roleId: null }
}

const handleCancelGrant = () => {
  pendingGrant.value = null
}

const handleSaveGrant = () => {
  if (!pendingGrant.value?.villageId || !pendingGrant.value?.roleId) return

  grants.value.push({
    grantId: nextGrantId++,
    villageId: pendingGrant.value.villageId,
    roleId: pendingGrant.value.roleId
  })
  pendingGrant.value = null
}

const handleDeleteGrant = (grantId) => {
  grants.value = grants.value.filter(g => g.grantId !== grantId)
}

const grantedVillageIds = computed(() => {
  return new Set(grants.value.map(g => g.villageId))
})

const availableVillages = computed(() => {
  return (villages.value || []).filter(v => !grantedVillageIds.value.has(v.villageId))
})

const villageNameById = computed(() => {
  const map = new Map()
  for (const v of (villages.value || [])) map.set(v.villageId, v.name)
  return map
})

const displayGrants = computed(() => {
  const mapped = grants.value.map(grant => ({
    grantId: grant.grantId,
    villageId: grant.villageId,
    roleId: grant.roleId,
    roleLabel: getRoleLabel(grant.roleId),
    villageName: villageNameById.value.get(grant.villageId) || ''
  }))

  return [...mapped].sort((a, b) => {
    if (sortBy.value === 'village') {
      return sortDirection.value === 'asc' ? a.villageName.localeCompare(b.villageName) : b.villageName.localeCompare(a.villageName)
    } else if (sortBy.value === 'role') {
      return sortDirection.value === 'asc' ? a.roleId - b.roleId : b.roleId - a.roleId
    }
    return 0
  })
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

const isFormValid = computed(() => {
  return !!username.value.trim()
})

async function handleSubmit() {
  usernameError.value = ''
  formError.value = ''

  if (!username.value.trim()) {
    usernameError.value = 'Username is required.'
    return
  }

  isSubmitting.value = true
  try {
    await createUser({
      username: username.value.trim(),
      firstName: firstName.value.trim() || undefined,
      lastName: lastName.value.trim() || undefined,
      villageGrants: grants.value.map(g => ({ villageId: g.villageId, roleId: g.roleId })),
    })
    router.push({ name: 'admin-user-access' })
  }
  catch (err) {
    if (err.status === 422) {
      usernameError.value = extractApiErrorMessage(err, 'That username could not be used.')
    }
    else {
      formError.value = extractApiErrorMessage(err, 'Failed to create user.')
    }
  }
  finally {
    isSubmitting.value = false
  }
}

function handleCancel() {
  router.push({ name: 'admin-user-access' })
}
</script>

<template>
  <div class="user-create">
    <h1>New User</h1>

    <form @submit.prevent="handleSubmit" class="user-form">
      <div class="name-fields-row">
        <div class="form-field">
          <label for="username">Username <span class="required">*</span></label>
          <InputText
            id="username"
            v-model="username"
            class="w-full"
            :class="{ 'p-invalid': usernameError }"
          />
          <small class="field-error" v-if="usernameError">{{ usernameError }}</small>
        </div>

        <div class="form-field">
          <label for="firstName">First Name</label>
          <InputText id="firstName" v-model="firstName" class="w-full" />
        </div>

        <div class="form-field">
          <label for="lastName">Last Name</label>
          <InputText id="lastName" v-model="lastName" class="w-full" />
        </div>

        <div class="form-actions">
          <Button label="Cancel" severity="secondary" :disabled="isSubmitting" @click="handleCancel" />
          <Button type="submit" label="Create User" :loading="isSubmitting" :disabled="!isFormValid" />
        </div>
      </div>

      <small class="field-error" v-if="formError">{{ formError }}</small>

      <div class="grants-section">
        <div class="grants-header">
          <h2>Village Grants</h2>
          <Button
            label="+ Create Grant"
            :disabled="!!pendingGrant"
            @click="handleCreateGrant"
          />
        </div>

        <div v-if="displayGrants.length === 0 && !pendingGrant" class="empty-state">
          <p>No grants added yet</p>
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
                :options="roles"
                option-label="label"
                option-value="id"
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
                  :disabled="!pendingGrant.villageId || !pendingGrant.roleId"
                  @click="handleSaveGrant"
                  title="Save grant"
                />
                <Button
                  icon="pi pi-times"
                  severity="secondary"
                  size="small"
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
    </form>
  </div>
</template>

<style scoped>
.user-create {
  padding: 2rem;
}

h1 {
  margin: 0 0 2rem 0;
  color: var(--color-text-primary);
  font-size: 1.5rem;
}

.user-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.name-fields-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr) auto;
  align-items: end;
  gap: 1.5rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-field label {
  color: var(--color-text-primary);
  font-weight: 500;
  font-size: 0.95rem;
}

.required {
  color: var(--color-text-error);
}

.field-error {
  color: var(--color-text-error);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
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

@media (max-width: 600px) {
  .name-fields-row {
    grid-template-columns: 1fr;
  }

  .form-actions {
    flex-direction: column;
  }
}

@media (max-width: 768px) {
  .user-create {
    padding: 1rem;
  }
}
</style>
