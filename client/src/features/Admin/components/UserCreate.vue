<script setup>
import { computed, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRoles } from '../../../shared/composables/useRoles.js'
import { getVillages } from '../api/villageGrantApi.js'
import { createUser } from '../../../shared/api/userApi.js'
import { extractApiErrorMessage } from '../lib/userAdminHelpers.js'
import GrantsEditor from './GrantsEditor.vue'

const router = useRouter()
const { getRoleLabel, fetchRoles } = useRoles()
fetchRoles()

const { state: villages } = useAsyncState(() => getVillages(), { immediate: true })

const username = ref('')
const firstName = ref('')
const lastName = ref('')

const isSubmitting = ref(false)
const usernameError = ref('')
const formError = ref('')

const editorRef = useTemplateRef('editor')

// Staged grants, not yet persisted; grantId is a local key only.
const stagedGrants = ref([])
let nextGrantId = 0

const villageNameById = computed(() => {
  const map = new Map()
  for (const v of (villages.value || [])) map.set(v.villageId, v.name)
  return map
})

const grantRows = computed(() => stagedGrants.value.map(g => ({
  grantId: g.grantId,
  villageId: g.villageId,
  scopeLabel: g.villageId == null ? 'Hub' : (villageNameById.value.get(g.villageId) || ''),
  isHub: g.villageId == null,
  roleId: g.roleId,
  roleLabel: getRoleLabel(g.roleId),
})))

const handleAddGrant = ({ villageId, roleIds }) => {
  for (const roleId of roleIds) {
    stagedGrants.value.push({ grantId: `staged-${nextGrantId++}`, villageId, roleId })
  }
  editorRef.value?.clearPending()
}

const handleDeleteGrant = (row) => {
  stagedGrants.value = stagedGrants.value.filter(g => g.grantId !== row.grantId)
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
      roleGrants: stagedGrants.value.map(g => ({ roleId: g.roleId, villageId: g.villageId })),
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

      <GrantsEditor
        ref="editor"
        :rows="grantRows"
        :villages="villages || []"
        :busy="isSubmitting"
        @add="handleAddGrant"
        @delete="handleDeleteGrant"
      />
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
