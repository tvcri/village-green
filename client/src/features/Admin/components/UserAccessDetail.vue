<script setup>
import { computed, ref, onMounted, useTemplateRef } from 'vue'
import { useRoute } from 'vue-router'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRoles } from '../../../shared/composables/useRoles.js'
import { getVillages } from '../api/villageGrantApi.js'
import { getUsers, getUserGrants, deleteUserGrant, createUserGrant } from '../api/userGrantApi.js'
import { updateUser } from '../../../shared/api/userApi.js'
import { useConfirm } from 'primevue/useconfirm'
import { extractApiErrorMessage } from '../lib/userAdminHelpers.js'
import { toGrantRows } from '../lib/grantDisplayHelpers.js'
import { useCurrentUser } from '../../../shared/composables/useCurrentUser.js'
import GrantsEditor from './GrantsEditor.vue'

const route = useRoute()
const { getRoleLabel, fetchRoles } = useRoles()
fetchRoles()

const confirm = useConfirm()
const { user: currentUser } = useCurrentUser()

const selectedUserId = ref(null)
const isSavingGrant = ref(false)
const grantError = ref('')
const isEditingUsername = ref(false)
const usernameDraft = ref('')
const isSavingUsername = ref(false)
const usernameError = ref('')

const editorRef = useTemplateRef('editor')

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

const grantRows = computed(() => toGrantRows(grants.value, getRoleLabel))

const handleAddGrant = async ({ villageId, roleIds }) => {
  isSavingGrant.value = true
  grantError.value = ''
  try {
    await createUserGrant(selectedUserId.value, roleIds.map(roleId => ({ roleId, villageId })))
    await refetchGrants()
    editorRef.value?.clearPending()
  } catch (err) {
    grantError.value = extractApiErrorMessage(err, 'Failed to create grant.')
  } finally {
    isSavingGrant.value = false
  }
}

const performDelete = async (grantId) => {
  isSavingGrant.value = true
  grantError.value = ''
  try {
    await deleteUserGrant(selectedUserId.value, grantId)
    await refetchGrants()
  } catch (err) {
    grantError.value = extractApiErrorMessage(err, 'Failed to delete grant.')
  } finally {
    isSavingGrant.value = false
  }
}

// Self-lockout guard: deleting your own Hub grant can remove access to this
// screen (e.g. Admin). Confirm before proceeding; village grants and other
// users' grants delete without ceremony.
const handleDeleteGrant = (row) => {
  const isSelf = String(selectedUserId.value) === String(currentUser.value?.userId)
  if (row.isHub && isSelf) {
    confirm.require({
      header: 'Delete your own Hub grant',
      message: `You are deleting your own "${row.roleLabel}" Hub grant. If this removes Admin you will lose access to this screen. Continue?`,
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptProps: { severity: 'danger' },
      accept: () => performDelete(row.grantId),
    })
  } else {
    performDelete(row.grantId)
  }
}

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
</script>

<template>
  <div class="user-access-detail">
    <h1>
      User Access
      <Tag v-if="selectedUser?.isVolunteer" value="VSS" severity="warn" title="Eligible for Volunteer Self-Signup" />
    </h1>

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
      </div>

      <small v-if="grantError" class="field-error">{{ grantError }}</small>

      <GrantsEditor
        ref="editor"
        :rows="grantRows"
        :villages="villages || []"
        :busy="isSavingGrant"
        @add="handleAddGrant"
        @delete="handleDeleteGrant"
      />
    </div>
  </div>
</template>

<style scoped>
.user-access-detail {
  padding: 2rem;
}

h1 {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 2rem 0;
  color: var(--color-text-primary);
  font-size: 1.5rem;
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

@media (max-width: 768px) {
  .user-access-detail {
    padding: 1rem;
  }
}
</style>
