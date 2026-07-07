<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { formatLocalDateTime } from '../../../shared/lib/dateUtils.js'
import { getUsers, updateUser, deleteUser } from '../../../shared/api/userApi.js'
import { isDuplicateUsername, getDeleteConfirmCopy, extractApiErrorMessage } from '../lib/userAdminHelpers.js'

const router = useRouter()
const toast = useToast()

const searchText = ref('')
const cellError = ref({ userId: null, message: '' })

const { state: users, isLoading } = useAsyncState(
  () => getUsers(),
  { immediate: true }
)

const filteredUsers = computed(() => {
  if (!users.value) return []
  const q = searchText.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(u =>
    u.username.toLowerCase().includes(q) ||
    (u.displayName || '').toLowerCase().includes(q)
  )
})

function goToCreate() {
  router.push({ name: 'admin-user-create' })
}

function goToGrants(userId) {
  router.push({ name: 'admin-user-grants', params: { userId } })
}

async function onCellEditComplete(event) {
  const { data, newValue, field } = event
  if (field !== 'username') return

  const trimmed = (newValue || '').trim()
  cellError.value = { userId: null, message: '' }

  if (!trimmed || trimmed === data.username) {
    return
  }

  const otherUsernames = users.value
    .filter(u => u.userId !== data.userId)
    .map(u => u.username)

  if (isDuplicateUsername(trimmed, otherUsernames)) {
    cellError.value = { userId: data.userId, message: 'That username is already in use.' }
    return
  }

  try {
    const updated = await updateUser(data.userId, { username: trimmed })
    const index = users.value.findIndex(u => u.userId === data.userId)
    if (index !== -1) {
      users.value[index] = { ...users.value[index], ...updated }
    }
  }
  catch (err) {
    cellError.value = { userId: data.userId, message: extractApiErrorMessage(err, 'Failed to rename user.') }
  }
}

async function onDeleteUser(user) {
  const { message, confirmLabel } = getDeleteConfirmCopy(user)
  if (!confirm(`${message}\n\nClick OK to ${confirmLabel.toLowerCase()}.`)) return

  try {
    const result = await deleteUser(user.userId)
    if (result && result.status === 'unavailable') {
      const index = users.value.findIndex(u => u.userId === user.userId)
      if (index !== -1) users.value[index] = { ...users.value[index], ...result }
    }
    else {
      users.value = users.value.filter(u => u.userId !== user.userId)
    }
    toast.add({ severity: 'success', summary: confirmLabel, detail: `${confirmLabel}d user ${user.username}`, life: 2000 })
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: extractApiErrorMessage(err, 'Failed to delete user.'), life: 3000 })
  }
}
</script>

<template>
  <div class="user-list">
    <div class="list-header">
      <h1>Users</h1>
      <div class="header-actions">
        <InputText v-model="searchText" placeholder="Search username or name" />
        <Button label="+ New User" @click="goToCreate" />
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <p>Loading users...</p>
    </div>

    <DataTable
      v-else
      :value="filteredUsers"
      data-key="userId"
      edit-mode="cell"
      @cell-edit-complete="onCellEditComplete"
      sort-field="username"
      :sort-order="1"
      class="users-table-responsive"
    >
      <Column field="username" header="Username" sortable>
        <template #editor="{ data, field }">
          <InputText v-model="data[field]" autofocus fluid />
        </template>
        <template #body="{ data }">
          <div>
            {{ data.username }}
            <div v-if="cellError.userId === data.userId" class="field-error">{{ cellError.message }}</div>
          </div>
        </template>
      </Column>
      <Column field="displayName" header="Display Name" sortable></Column>
      <Column field="status" header="Status" sortable>
        <template #body="{ data }">
          <Tag :value="data.status" :severity="data.status === 'available' ? 'success' : 'danger'" />
        </template>
      </Column>
      <Column header="Grants">
        <template #body="{ data }">
          <Button
            :label="String((data.villageGrants || []).length)"
            link
            @click="goToGrants(data.userId)"
          />
        </template>
      </Column>
      <Column field="lastAccess" header="Last Access" sortable>
        <template #body="{ data }">{{ data.lastAccess ? formatLocalDateTime(data.lastAccess) : '—' }}</template>
      </Column>
      <Column header="Created" sortable :sort-field="row => row.statistics?.created">
        <template #body="{ data }">{{ data.statistics?.created ? formatLocalDateTime(data.statistics.created) : '—' }}</template>
      </Column>
      <Column header="Actions" :exportable="false">
        <template #body="{ data }">
          <Button
            icon="pi pi-trash"
            severity="danger"
            size="small"
            @click="onDeleteUser(data)"
            :title="getDeleteConfirmCopy(data).confirmLabel"
          />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.user-list {
  padding: 2rem;
}

h1 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 1.5rem;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.loading-state {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-dim);
}

.field-error {
  color: var(--color-text-error);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

@media (max-width: 768px) {
  .user-list {
    padding: 1rem;
  }
}
</style>
