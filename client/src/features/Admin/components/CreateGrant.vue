<script setup>
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRoleLabels } from '../../../shared/composables/useRoleLabels.js'
import { getVillageGrants, createVillageGrant } from '../api/villageGrantApi.js'
import { getUsers } from '../../../shared/api/userApi.js'

const router = useRouter()
const route = useRoute()
const { getRoles } = useRoleLabels()

const villageId = computed(() => route.params.villageId)

const selectedRoleId = ref(null)
const userSearchQuery = ref('')
const selectedUsers = ref([])
const isSubmitting = ref(false)

const { state: grants } = useAsyncState(
  () => villageId.value ? getVillageGrants(villageId.value) : Promise.resolve([]),
  { immediate: true }
)

const { state: allUsers } = useAsyncState(
  () => getUsers(),
  { immediate: true }
)

const existingGranteeIds = computed(() => {
  if (!grants.value) return new Set()
  return new Set(grants.value
    .map(g => g.user?.userId || g.userGroup?.userGroupId)
    .filter(Boolean))
})

const filteredUsers = computed(() => {
  if (!allUsers.value) return []

  const availableUsers = allUsers.value.filter(user => !existingGranteeIds.value.has(user.userId) && !selectedUsers.value.includes(user.userId))

  if (!userSearchQuery.value.trim()) {
    return availableUsers
  }

  const query = userSearchQuery.value.toLowerCase()
  return availableUsers.filter(user => {
    const displayName = (user.displayName || '').toLowerCase()
    const username = (user.username || '').toLowerCase()
    return displayName.includes(query) || username.includes(query)
  })
})

const roles = getRoles()

const handleAddUser = (userId) => {
  if (!selectedUsers.value.includes(userId)) {
    selectedUsers.value.push(userId)
  }
  userSearchQuery.value = ''
}

const handleRemoveUser = (userId) => {
  selectedUsers.value = selectedUsers.value.filter(id => id !== userId)
}

const getUserDisplayName = (userId) => {
  const user = allUsers.value?.find(u => u.userId === userId)
  return user?.displayName || user?.username || userId
}

const handleSubmit = async () => {
  if (!selectedRoleId.value || selectedUsers.value.length === 0) return

  isSubmitting.value = true
  try {
    const grantsToCreate = selectedUsers.value.map(userId => ({
      userId,
      roleId: parseInt(selectedRoleId.value, 10)
    }))

    await createVillageGrant(villageId.value, grantsToCreate)
    router.push({
      name: 'admin-village-access',
      query: { villageId: villageId.value }
    })
  } catch (err) {
    console.error('Failed to create grants:', err)
    isSubmitting.value = false
  }
}

const handleCancel = () => {
  router.push({ name: 'admin-village-access' })
}

const isFormValid = computed(() => {
  return selectedRoleId.value && selectedUsers.value.length > 0
})
</script>

<template>
  <div class="create-grant">
    <h1>Create New Grant</h1>

    <form @submit.prevent="handleSubmit" class="grant-form">
      <div class="form-group">
        <label for="role-select">Select Role:</label>
        <select
          id="role-select"
          v-model="selectedRoleId"
          class="dropdown"
          required
        >
          <option value="">-- Choose a role --</option>
          <option
            v-for="role in roles"
            :key="role.id"
            :value="role.id"
          >
            {{ role.label }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label for="user-search">Select Users:</label>
        <div class="user-search-container">
          <input
            id="user-search"
            v-model="userSearchQuery"
            type="text"
            placeholder="Search by name or username..."
            class="search-input"
          />
          <div v-if="userSearchQuery" class="user-dropdown">
            <div
              v-for="user in filteredUsers"
              :key="user.userId"
              class="user-option"
              @click="handleAddUser(user.userId)"
            >
              <div class="user-name">{{ user.displayName || user.username }}</div>
              <div class="user-username">{{ user.username }}</div>
            </div>
            <div v-if="filteredUsers.length === 0" class="user-option disabled">
              No matching users found
            </div>
          </div>
        </div>
        <p v-if="selectedUsers.length === 0 && filteredUsers.length === 0 && !userSearchQuery" class="helper-text">
          All users already have grants for this village
        </p>
      </div>

      <div v-if="selectedUsers.length > 0" class="selected-users">
        <label>Selected Users:</label>
        <div class="user-chips">
          <div v-for="userId in selectedUsers" :key="userId" class="user-chip">
            <span>{{ getUserDisplayName(userId) }}</span>
            <button
              type="button"
              class="remove-btn"
              @click="handleRemoveUser(userId)"
              title="Remove user"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button
          type="button"
          class="btn-cancel"
          @click="handleCancel"
          :disabled="isSubmitting"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="btn-submit"
          :disabled="!isFormValid || isSubmitting"
        >
          {{ isSubmitting ? 'Creating...' : `Create Grant${selectedUsers.length > 1 ? 's' : ''}` }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.create-grant {
  padding: 2rem;
  max-width: 600px;
}

h1 {
  margin: 0 0 2rem 0;
  color: var(--color-text-primary);
  font-size: 1.5rem;
}

.grant-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  color: var(--color-text-primary);
  font-weight: 500;
  font-size: 0.95rem;
}

.dropdown {
  padding: 0.5rem 0.75rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  color: var(--color-text-primary);
  font-size: 0.9rem;
  cursor: pointer;
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

.user-search-container {
  position: relative;
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.search-input:focus {
  outline: none;
  border-color: var(--color-primary-highlight-light);
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.1);
}

.user-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 0.25rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  max-height: 250px;
  overflow-y: auto;
  z-index: 10;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.user-option {
  padding: 0.75rem;
  cursor: pointer;
  transition: background-color 0.15s ease;
  border-bottom: 1px solid var(--color-border-default);
}

.user-option:last-child {
  border-bottom: none;
}

.user-option:not(.disabled):hover {
  background-color: var(--color-background-dark);
}

.user-option.disabled {
  cursor: not-allowed;
  color: var(--color-text-dim);
  text-align: center;
  font-style: italic;
}

.user-name {
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.user-username {
  font-size: 0.8rem;
  color: var(--color-text-dim);
  margin-top: 0.2rem;
}

.helper-text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-dim);
  font-style: italic;
}

.selected-users {
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  padding: 1rem;
  background-color: var(--color-background-dark);
}

.selected-users label {
  display: block;
  color: var(--color-text-primary);
  font-weight: 500;
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
}

.user-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background-color: var(--color-primary);
  color: white;
  border-radius: 20px;
  font-size: 0.9rem;
}

.remove-btn {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 0;
  font-size: 0.9rem;
  transition: opacity 0.2s ease;
}

.remove-btn:hover {
  opacity: 0.8;
}

.form-actions {
  display: flex;
  flex-direction: row;
  gap: 1rem;
  margin-top: 1rem;
  width: 100%;
  justify-content: flex-end;
}

.btn-submit,
.btn-cancel {
  padding: 0.6rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  width: auto;
}

.btn-submit {
  background-color: var(--color-primary);
  color: white;
}

.btn-submit:hover:not(:disabled) {
  background-color: var(--color-primary-hover);
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-cancel {
  background-color: var(--color-background-light);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-default);
}

.btn-cancel:hover:not(:disabled) {
  background-color: var(--color-background-subtle);
}

.btn-cancel:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .create-grant {
    padding: 1rem;
  }

  .form-actions {
    flex-direction: row;
    justify-content: flex-end;
  }

  .btn-submit,
  .btn-cancel {
    width: auto;
  }

  .user-chips {
    flex-wrap: wrap;
  }

  .user-chip {
    width: auto;
  }
}
</style>
