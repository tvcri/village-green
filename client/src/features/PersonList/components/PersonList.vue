<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { getPersons } from '../api/personApi.js'

defineOptions({ name: 'PersonList' })

const router = useRouter()

useScrollRestore('meta-persons', 'meta-person-detail')

const firstName = ref('')
const lastName = ref('')
const phone = ref('')
const email = ref('')

const hasFilter = computed(() =>
  firstName.value.trim() || lastName.value.trim() || phone.value.trim() || email.value.trim()
)

const { state: persons, isLoading, execute: fetchPersons } = useAsyncState(
  () => getPersons({
    firstName: firstName.value.trim() || undefined,
    lastName: lastName.value.trim() || undefined,
    phone: phone.value.trim() || undefined,
    email: email.value.trim() || undefined
  }),
  { immediate: false }
)

function parseJson(val) {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return [] }
  }
  return []
}

function parsePhoneObj(val) {
  if (val && typeof val === 'object') return val
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return {} }
  }
  return {}
}

function getRoleSeverity(role) {
  if (role === 'member') return 'info'
  if (role === 'volunteer') return 'success'
  return 'secondary'
}

function navigateToPerson(personId) {
  router.push({ name: 'meta-person-detail', params: { personId }, query: { from: 'meta' } })
}

function onSearch() {
  if (hasFilter.value) fetchPersons()
}
</script>

<template>
  <div class="person-list">
    <div class="list-header">
      <h2>Persons</h2>
    </div>

    <div class="filters">
      <IconField>
        <InputIcon class="pi pi-user" />
        <InputText v-model="firstName" placeholder="First name" @keyup.enter="onSearch" />
      </IconField>
      <IconField>
        <InputIcon class="pi pi-user" />
        <InputText v-model="lastName" placeholder="Last name" @keyup.enter="onSearch" />
      </IconField>
      <IconField>
        <InputIcon class="pi pi-phone" />
        <InputText v-model="phone" placeholder="Phone" @keyup.enter="onSearch" />
      </IconField>
      <IconField>
        <InputIcon class="pi pi-envelope" />
        <InputText v-model="email" placeholder="Email" @keyup.enter="onSearch" />
      </IconField>
      <Button
        label="Search"
        icon="pi pi-search"
        :loading="isLoading"
        :disabled="!hasFilter"
        @click="onSearch"
      />
    </div>

    <div v-if="persons === null" class="empty-state">
      Enter at least one filter to search persons.
    </div>

    <div v-else-if="!isLoading && persons.length === 0" class="empty-state">
      No persons found.
    </div>

    <DataTable
      v-else
      :value="persons"
      :loading="isLoading"
      striped-rows
      hover
      @row-click="(event) => navigateToPerson(event.data.personId)"
    >
      <Column field="fullName" header="Name" sortable style="width: 20%" />
      <Column field="village.name" header="Village" sortable style="width: 15%" />
      <Column header="Roles" style="width: 15%">
        <template #body="{ data }">
          <div class="role-tags">
            <Tag
              v-for="role in parseJson(data.roles)"
              :key="role"
              :value="role"
              :severity="getRoleSeverity(role)"
            />
          </div>
        </template>
      </Column>
      <Column header="Phone" style="width: 15%">
        <template #body="{ data }">
          <span>{{ parsePhoneObj(data.phone).phone || '—' }}</span>
        </template>
      </Column>
      <Column header="Cell" style="width: 15%">
        <template #body="{ data }">
          <span>{{ parsePhoneObj(data.phone).cell || '—' }}</span>
        </template>
      </Column>
      <Column field="email" header="Email" style="width: 20%">
        <template #body="{ data }">
          <span>{{ data.email || '—' }}</span>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.person-list {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.list-header h2 {
  margin: 0;
  color: var(--color-text-primary);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.role-tags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.empty-state {
  color: var(--color-text-dim);
  font-style: italic;
  padding: 2rem 0;
  text-align: center;
}

@media (max-width: 768px) {
  .person-list {
    padding: 1rem;
  }
  .filters {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
