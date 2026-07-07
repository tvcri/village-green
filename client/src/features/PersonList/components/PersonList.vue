<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { getPersons } from '../api/personApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'

defineOptions({ name: 'PersonList' })

const router = useRouter()

useScrollRestore('meta-persons', 'meta-person-detail')

const firstName = ref('')
const lastName = ref('')
const phone = ref('')
const email = ref('')
const selectedVillage = ref('All villages')

const showMembers = ref(false)
const showVolunteers = ref(false)

// Village options for the filter; 'All villages' is the sentinel meaning no
// village restriction (server returns persons across all granted villages).
const { state: allVillages } = useAsyncState(() => getVillages(), { immediate: true })
const villageOptions = computed(() => [
  'All villages',
  ...(allVillages.value ?? []).map(v => v.name)
])

const selectedVillageId = computed(() => {
  if (selectedVillage.value === 'All villages') return undefined
  return (allVillages.value ?? []).find(v => v.name === selectedVillage.value)?.villageId
})

const hasFilter = computed(() =>
  firstName.value.trim() || lastName.value.trim() || phone.value.trim() ||
  email.value.trim() || !!selectedVillageId.value
)

const { state: persons, isLoading, execute: fetchPersons } = useAsyncState(
  () => getPersons({
    villageId: selectedVillageId.value ? [selectedVillageId.value] : undefined,
    firstName: firstName.value.trim() || undefined,
    lastName: lastName.value.trim() || undefined,
    phone: phone.value.trim() || undefined,
    email: email.value.trim() || undefined
  }),
  { immediate: false }
)

const filteredPersons = computed(() => {
  if (!persons.value) return null
  if (!showMembers.value && !showVolunteers.value) return persons.value
  return persons.value.filter(p => {
    const roles = parseJson(p.roles)
    if (showMembers.value && roles.includes('member')) return true
    if (showVolunteers.value && roles.includes('volunteer')) return true
    return false
  })
})

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

function navigateToPerson(personId, fullName) {
  router.push({
    name: 'meta-person-detail',
    params: { personId, personName: fullName },
    query: { from: 'meta' }
  })
}

watch([firstName, lastName, phone, email, selectedVillage], () => {
  if (!hasFilter.value) persons.value = null
})

function onSearch() {
  if (hasFilter.value) fetchPersons()
}
</script>

<template>
  <div class="person-list">
    <div class="list-header">
      <h2>Persons</h2>
      <div class="header-actions">
        <span v-if="filteredPersons !== null && !isLoading" class="result-count">
          {{ filteredPersons.length }} {{ filteredPersons.length === 1 ? 'person' : 'persons' }}
        </span>
        <Button label="New Person" icon="pi pi-plus" @click="$router.push({ name: 'meta-person-create' })" />
        <Button label="Import Application" icon="pi pi-file-import" severity="secondary"
          @click="$router.push({ name: 'meta-person-import' })" />
      </div>
    </div>

    <div class="filters">
      <Select
        v-model="selectedVillage"
        :options="villageOptions"
        placeholder="Village"
        class="filter-village"
        :pt="{ root: { style: 'width: 12rem;' } }"
      />
      <IconField class="filter-input">
        <InputIcon class="pi pi-user" />
        <InputText v-model="firstName" placeholder="First name" @keyup.enter="onSearch" />
      </IconField>
      <IconField class="filter-input">
        <InputIcon class="pi pi-user" />
        <InputText v-model="lastName" placeholder="Last name" @keyup.enter="onSearch" />
      </IconField>
      <IconField class="filter-input">
        <InputIcon class="pi pi-phone" />
        <InputText v-model="phone" placeholder="Phone" @keyup.enter="onSearch" />
      </IconField>
      <IconField class="filter-input">
        <InputIcon class="pi pi-envelope" />
        <InputText v-model="email" placeholder="Email" @keyup.enter="onSearch" />
      </IconField>
      <div class="filter-actions">
      <Button
        icon="pi pi-times"
        severity="secondary"
        text
        :disabled="!hasFilter"
        @click="firstName = ''; lastName = ''; phone = ''; email = ''; selectedVillage = 'All villages'"
      />
      <Button
        label="Search"
        icon="pi pi-search"
        :loading="isLoading"
        :disabled="!hasFilter"
        @click="onSearch"
      />
      </div>
    </div>

    <div v-if="persons !== null && !isLoading" class="role-filters">
      <label class="role-filter-label">
        <Checkbox v-model="showMembers" :binary="true" />
        <span>Member</span>
      </label>
      <label class="role-filter-label">
        <Checkbox v-model="showVolunteers" :binary="true" />
        <span>Volunteer</span>
      </label>
    </div>

    <div v-if="filteredPersons === null" class="empty-state">
      Enter at least one filter to search persons.
    </div>

    <div v-else-if="!isLoading && filteredPersons.length === 0" class="empty-state">
      No persons found.
    </div>

    <DataTable
      v-else
      :value="filteredPersons"
      :loading="isLoading"
      striped-rows
      hover
      class="person-table"
      :pt="{ tableContainer: { style: 'overflow: visible;' }, thead: { style: 'top: var(--breadcrumb-height); z-index: 1;' } }"
      @row-click="(event) => navigateToPerson(event.data.personId, event.data.fullName)"
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
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

/* Inputs grow to share the leftover horizontal space (min-width keeps them
   readable before wrapping); the action buttons stay their natural size and
   push flush-right, dropping to a second line only when the row can't hold
   everything. */
.filter-input {
  flex: 1 1 9rem;
  min-width: 9rem;
}

.filter-input :deep(.p-inputtext) {
  width: 100%;
}

.filter-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-left: auto;
}

.role-filters {
  display: flex;
  gap: 1.5rem;
  align-items: center;
}

.role-filter-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
}

.role-tags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.result-count {
  font-size: 0.9rem;
  color: var(--color-text-dim);
}

.person-table {
  cursor: pointer;
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
  /* Let fields fill the column on narrow screens. */
  .filter-village,
  .filter-village :deep(.p-select),
  .filter-input {
    width: 100% !important;
  }
  .filter-actions {
    margin-left: 0;
  }
}
</style>
