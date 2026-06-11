<script setup>
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Dropdown from 'primevue/dropdown'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRoleLabels } from '../../../shared/composables/useRoleLabels.js'
import { getVillages } from '../api/villageGrantApi.js'
import { getUserGrants, createUserGrant } from '../api/userGrantApi.js'

const router = useRouter()
const route = useRoute()
const { getRoles } = useRoleLabels()

const userId = computed(() => route.params.userId)

const selectedRoleId = ref(null)
const selectedVillages = ref([])
const isSubmitting = ref(false)

const { state: villages } = useAsyncState(
  () => getVillages(),
  { immediate: true }
)

const { state: userGrants } = useAsyncState(
  () => getUserGrants(userId.value),
  { immediate: true }
)

const roles = getRoles()

const grantedVillageIds = computed(() => {
  if (!userGrants.value) return new Set()
  return new Set(userGrants.value.map(g => g.village.villageId))
})

const isVillageGranted = (villageId) => {
  return grantedVillageIds.value.has(villageId)
}

const toggleVillage = (villageId) => {
  const index = selectedVillages.value.indexOf(villageId)
  if (index > -1) {
    selectedVillages.value.splice(index, 1)
  } else {
    selectedVillages.value.push(villageId)
  }
}

const handleSubmit = async () => {
  if (!selectedRoleId.value || selectedVillages.value.length === 0) return

  isSubmitting.value = true
  try {
    const grantsToCreate = selectedVillages.value.map(villageId => ({
      villageId,
      roleId: parseInt(selectedRoleId.value, 10)
    }))

    await createUserGrant(userId.value, grantsToCreate)
    router.push({
      name: 'admin-user-access',
      query: { userId: userId.value }
    })
  } catch (err) {
    console.error('Failed to create grants:', err)
    isSubmitting.value = false
  }
}

const handleCancel = () => {
  router.push({ name: 'admin-user-access' })
}

const isFormValid = computed(() => {
  return selectedRoleId.value && selectedVillages.value.length > 0
})
</script>

<template>
  <div class="create-grant">
    <h1>Create New Grant</h1>

    <form @submit.prevent="handleSubmit" class="grant-form">
      <div class="form-group">
        <label for="role-select">Select Role:</label>
        <Dropdown
          id="role-select"
          v-model="selectedRoleId"
          :options="roles"
          option-label="label"
          option-value="id"
          placeholder="-- Choose a role --"
        />
      </div>

      <div class="form-group">
        <label>Select Villages:</label>
        <div class="village-list">
          <div v-for="village in villages" :key="village.villageId" class="village-checkbox" :class="{ disabled: isVillageGranted(village.villageId) }">
            <input
              :id="`village-${village.villageId}`"
              type="checkbox"
              :value="village.villageId"
              :checked="selectedVillages.includes(village.villageId)"
              :disabled="isVillageGranted(village.villageId)"
              @change="toggleVillage(village.villageId)"
            />
            <label :for="`village-${village.villageId}`">{{ village.name }}</label>
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
          {{ isSubmitting ? 'Creating...' : `Create Grant${selectedVillages.length > 1 ? 's' : ''}` }}
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

.dropdown:invalid {
  color: var(--color-text-dim);
}

.dropdown option {
  color: var(--color-text-primary);
}

.dropdown option[value=""] {
  color: var(--color-text-dim);
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

.village-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  padding: 0.5rem 0;
}

.village-checkbox {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.village-checkbox input[type="checkbox"] {
  cursor: pointer;
  width: 18px;
  height: 18px;
  margin: 0;
}

.village-checkbox label {
  margin: 0;
  font-weight: normal;
  font-size: 0.95rem;
  cursor: pointer;
  color: var(--color-text-primary);
}

.village-checkbox.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.village-checkbox.disabled input[type="checkbox"] {
  cursor: not-allowed;
}

.village-checkbox.disabled label {
  cursor: not-allowed;
  color: var(--color-text-dim);
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
  background-color: var(--p-primary-600);
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

@media (max-width: 600px) {
  .form-actions {
    flex-direction: column;
    gap: 0.5rem;
  }

  .btn-submit,
  .btn-cancel {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .create-grant {
    padding: 1rem;
  }
}
</style>
