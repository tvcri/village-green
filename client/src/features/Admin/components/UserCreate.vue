<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRoleLabels } from '../../../shared/composables/useRoleLabels.js'
import { getVillages } from '../api/villageGrantApi.js'
import { createUser } from '../../../shared/api/userApi.js'
import { extractApiErrorMessage } from '../lib/userAdminHelpers.js'

const router = useRouter()
const { getRoles } = useRoleLabels()
const roles = getRoles()

const { state: villages } = useAsyncState(() => getVillages(), { immediate: true })

const username = ref('')
const firstName = ref('')
const lastName = ref('')
const grantRows = ref([])

const isSubmitting = ref(false)
const usernameError = ref('')
const formError = ref('')

let nextRowKey = 0
function addGrantRow() {
  grantRows.value.push({ key: nextRowKey++, villageId: null, roleId: null })
}

function removeGrantRow(key) {
  grantRows.value = grantRows.value.filter(row => row.key !== key)
}

function villageOptionsForRow(row) {
  const chosenElsewhere = new Set(
    grantRows.value
      .filter(r => r.key !== row.key && r.villageId)
      .map(r => r.villageId)
  )
  return (villages.value || []).filter(v => !chosenElsewhere.has(v.villageId))
}

const isFormValid = computed(() => {
  if (!username.value.trim()) return false
  return grantRows.value.every(row => row.villageId && row.roleId)
})

async function handleSubmit() {
  usernameError.value = ''
  formError.value = ''

  if (!username.value.trim()) {
    usernameError.value = 'Username is required.'
    return
  }
  if (!isFormValid.value) {
    formError.value = 'Each grant row needs both a village and a role.'
    return
  }

  isSubmitting.value = true
  try {
    await createUser({
      username: username.value.trim(),
      firstName: firstName.value.trim() || undefined,
      lastName: lastName.value.trim() || undefined,
      villageGrants: grantRows.value.map(row => ({ villageId: row.villageId, roleId: row.roleId })),
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

      <div class="form-field">
        <label>Village Grants</label>
        <div v-for="row in grantRows" :key="row.key" class="grant-row">
          <Select
            v-model="row.villageId"
            :options="villageOptionsForRow(row)"
            option-label="name"
            option-value="villageId"
            placeholder="-- Village --"
          />
          <Select
            v-model="row.roleId"
            :options="roles"
            option-label="label"
            option-value="id"
            placeholder="-- Role --"
          />
          <Button icon="pi pi-trash" severity="danger" size="small" @click="removeGrantRow(row.key)" />
        </div>
        <Button label="+ Add Grant" size="small" text @click="addGrantRow" />
      </div>

      <small class="field-error" v-if="formError">{{ formError }}</small>

      <div class="form-actions">
        <Button label="Cancel" severity="secondary" :disabled="isSubmitting" @click="handleCancel" />
        <Button type="submit" label="Create User" :loading="isSubmitting" :disabled="!isFormValid" />
      </div>
    </form>
  </div>
</template>

<style scoped>
.user-create {
  padding: 2rem;
  max-width: 600px;
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

.grant-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

@media (max-width: 600px) {
  .grant-row {
    flex-direction: column;
    align-items: stretch;
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
