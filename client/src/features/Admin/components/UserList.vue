<script setup>
import { computed, ref, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Button from 'primevue/button'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { formatLocalDateTime } from '../../../shared/lib/dateUtils.js'
import { getUsersWithGrants, deleteUser } from '../../../shared/api/userApi.js'
import { getDeleteConfirmCopy, extractApiErrorMessage } from '../lib/userAdminHelpers.js'

defineOptions({ name: 'UserList' })

const router = useRouter()
const toast = useToast()

const searchText = ref('')
const pageRows = ref(10)

const { state: users, isLoading, execute: refetchUsers } = useAsyncState(
  () => getUsersWithGrants(),
  { immediate: true }
)

// Hub role wins when present (a hub grant implies federation-wide access);
// otherwise the user's village role names, de-duplicated across villages.
function roleLabel(user) {
  const hubNames = (user.federationGrants ?? []).map(g => g.name)
  if (hubNames.length) return [...new Set(hubNames)].join(', ')
  const villageNames = Object.values(user.grants ?? {}).flatMap(g => (g.roles ?? []).map(r => r.name))
  return villageNames.length ? [...new Set(villageNames)].join(', ') : '—'
}

let hasActivatedOnce = false
onActivated(() => {
  if (!hasActivatedOnce) {
    hasActivatedOnce = true
    return
  }
  refetchUsers()
})

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

function goToGrants(userId, displayName) {
  router.push({ name: 'admin-user-grants', params: { userId, displayName } })
}

function onRowClick(event) {
  goToGrants(event.data.userId, event.data.displayName)
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
        <IconField>
          <InputText v-model="searchText" placeholder="Search username or name" />
          <InputIcon v-if="searchText" class="pi pi-times" style="cursor: pointer" @click="searchText = ''" />
        </IconField>
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
      sort-field="username"
      :sort-order="1"
      paginator
      :rows="pageRows"
      class="users-table-responsive users-table-clickable-rows"
      @row-click="onRowClick"
    >
      <template #paginatorcontainer="{ first, last, page, pageCount, prevPageCallback, nextPageCallback, totalRecords }">
        <div class="paginator-container">
          <Button icon="pi pi-chevron-left" text rounded @click="prevPageCallback" :disabled="page === 0" />
          <span class="paginator-info">{{ first }}–{{ last }} of {{ totalRecords }}</span>
          <Button icon="pi pi-chevron-right" text rounded @click="nextPageCallback" :disabled="page === pageCount - 1" />
          <Select v-model="pageRows" :options="[10, 25, 50, 100]" />
        </div>
      </template>

      <Column field="username" header="Username" sortable></Column>
      <Column field="displayName" header="Display Name" sortable>
        <template #body="{ data }">{{ data.displayName === data.username ? '—' : data.displayName }}</template>
      </Column>
      <Column field="status" header="Status" sortable alignHeader="center" style="text-align: center;">
        <template #body="{ data }">
          <Tag :value="data.status" :severity="data.status === 'available' ? 'success' : 'danger'" />
        </template>
      </Column>
      <Column header="Role" sortable :sort-field="row => roleLabel(row)">
        <template #body="{ data }">{{ roleLabel(data) }}</template>
      </Column>
      <Column field="lastAccess" header="Last Access" sortable>
        <template #body="{ data }">{{ data.lastAccess ? formatLocalDateTime(data.lastAccess * 1000) : '—' }}</template>
      </Column>
      <Column header="Actions" :exportable="false" alignHeader="center" style="text-align: center;">
        <template #body="{ data }">
          <div class="row-actions">
            <Button
              icon="pi pi-trash"
              severity="danger"
              size="small"
              @click.stop="onDeleteUser(data)"
              :title="getDeleteConfirmCopy(data).confirmLabel"
            />
          </div>
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

.users-table-responsive {
  box-shadow: var(--box-shadow-card);
  border: 1px solid var(--color-border-default);
}

.row-actions {
  display: flex;
  gap: 0.5rem;
}

.users-table-clickable-rows :deep(.p-datatable-tbody > tr) {
  cursor: pointer;
}


@media (max-width: 768px) {
  .user-list {
    padding: 1rem;
  }
}
</style>
