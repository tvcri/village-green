<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useCurrentUser } from '../../../shared/composables/useCurrentUser.js'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import ExportButton from '../../../components/ExportButton.vue'
import { getPersons } from '../api/personApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { createSheet } from '../../../shared/services/googleSheetsService.js'
import { useAnalytics } from '../../../shared/composables/useAnalytics.js'

defineOptions({ name: 'PersonList' })

const router = useRouter()
const { hasPermission } = useCurrentUser()
const canWritePerson = computed(() => hasPermission('person:write'))
const { trackEvent } = useAnalytics()

let toast = null
onMounted(() => {
  toast = useToast()
})

useScrollRestore('meta-persons', 'meta-person-detail')

const firstName = ref('')
const lastName = ref('')
const phone = ref('')
const email = ref('')
const selectedVillage = ref('All villages')

const showMembers = ref(false)
const showVolunteers = ref(false)
const pageRows = ref(10)

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

// Shared with the export path so a detail re-fetch filters row-for-row the
// same way the table does.
function matchesRoleFilter(p) {
  if (!showMembers.value && !showVolunteers.value) return true
  const activeAs = parseJson(p.activeAs)
  return (showMembers.value && activeAs.includes('member')) ||
    (showVolunteers.value && activeAs.includes('volunteer'))
}

const filteredPersons = computed(() => {
  if (!persons.value) return null
  return persons.value.filter(matchesRoleFilter)
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

const isCreatingSheet = ref(false)
const isFetchingExport = ref(false)

// Fixed export column list (order and headers are the contract, never derived
// from row keys). Exports carry the full Person shape; the live table stays
// on summary rows.
const columnsForCsv = [
  { header: 'Name', key: 'fullName' },
  { header: 'Village', key: 'villageName' },
  { header: 'Roles', key: 'roles' },
  { header: 'First Name', key: 'firstName' },
  { header: 'Middle Initial', key: 'middleInitial' },
  { header: 'Last Name', key: 'lastName' },
  { header: 'Nickname', key: 'nickname' },
  { header: 'Street', key: 'street' },
  { header: 'Unit', key: 'unit' },
  { header: 'City', key: 'city' },
  { header: 'State', key: 'state' },
  { header: 'Zip', key: 'zip' },
  { header: 'Email', key: 'email' },
  { header: 'Phone', key: 'phone' },
  { header: 'Cell', key: 'cell' },
  { header: 'Birth Date', key: 'birthDate' },
  { header: 'Emergency Contact Name', key: 'emergencyContactName' },
  { header: 'Emergency Contact Relationship', key: 'emergencyContactRelationship' },
  { header: 'Emergency Contact Phone', key: 'emergencyContactPhone' },
  { header: 'Emergency Contact Email', key: 'emergencyContactEmail' },
  { header: 'Communities', key: 'communities' },
  { header: 'Disabilities', key: 'disabilities' }
]

// Rows are summary shape plus the projected `detail` object; email/phone/cell
// come from the summary root (detail deliberately omits them).
function detailRowForCsv(p) {
  const d = p.detail ?? {}
  return {
    fullName: p.fullName,
    villageName: p.village?.name ?? '',
    roles: parseJson(p.activeAs).join(', '),
    firstName: d.firstName,
    middleInitial: d.middleInitial,
    lastName: d.lastName,
    nickname: d.nickname,
    street: d.street,
    unit: d.unit,
    city: d.city,
    state: d.state,
    zip: d.zip,
    email: p.email,
    phone: parsePhoneObj(p.phone).phone,
    cell: parsePhoneObj(p.phone).cell,
    birthDate: d.birthDate,
    emergencyContactName: d.emergencyContactName,
    emergencyContactRelationship: d.emergencyContactRelationship,
    emergencyContactPhone: d.emergencyContactPhone,
    emergencyContactEmail: d.emergencyContactEmail,
    communities: (d.communities ?? []).map(c => c.name).join(', '),
    disabilities: (d.disabilities ?? [])
      .map(dis => dis.note ? `${dis.name} (${dis.note})` : dis.name)
      .join('; ')
  }
}

// Re-run the current search with projection=detail at export time — full rows
// (with communities/disabilities subqueries) are paid only here, never on the
// live search page.
async function fetchRowsForExport() {
  try {
    isFetchingExport.value = true
    const detail = await getPersons({
      villageId: selectedVillageId.value ? [selectedVillageId.value] : undefined,
      firstName: firstName.value.trim() || undefined,
      lastName: lastName.value.trim() || undefined,
      phone: phone.value.trim() || undefined,
      email: email.value.trim() || undefined,
      projection: ['detail']
    })
    const rows = detail.filter(matchesRoleFilter)
    if (rows.length !== (filteredPersons.value?.length ?? 0)) {
      throw new Error('The results changed since the last search — search again, then retry the export.')
    }
    return rows.map(detailRowForCsv)
  } finally {
    isFetchingExport.value = false
  }
}

async function handleDownloadCsv() {
  try {
    const rows = await fetchRowsForExport()
    const csv = toCsv(rows, columnsForCsv)
    downloadCsv(csv, 'persons.csv')
  } catch (err) {
    if (toast) {
      toast.add({ severity: 'error', summary: 'Export Failed', detail: err.message, life: 5000 })
    } else {
      console.error(err)
    }
  }
}

async function handleCreateSheet() {
  try {
    isCreatingSheet.value = true

    const rows = await fetchRowsForExport()
    const result = await createSheet(rows, columnsForCsv, 'Village Green Persons')
    const sheetUrl = result.url || result

    if (result.popupBlocked) {
      if (toast) {
        toast.add({
          severity: 'success',
          summary: 'Sheet Created',
          detail: `Your Google Sheet has been created. <a href="${sheetUrl}" target="_blank" style="color: inherit; text-decoration: underline;">Open it here</a>.`,
          life: 0,
          contentStyleClass: 'bg-green-50 border-green-200',
        })
      }
    } else {
      if (toast) {
        toast.add({
          severity: 'success',
          summary: 'Sheet Created',
          detail: 'Your Google Sheet has been created and opened in a new tab.',
          life: 3000,
        })
      }
    }
  } catch (err) {
    let message = 'Failed to create Google Sheet'
    if (err.message.includes('Popup was blocked')) {
      message = 'Please allow popups for this site to use Google Sheets export'
    } else if (err.message.includes('timeout')) {
      message = 'Sheet creation timed out. Please try again.'
    } else {
      message = `Error: ${err.message}`
    }

    if (toast) {
      toast.add({
        severity: 'error',
        summary: 'Sheet Creation Failed',
        detail: message,
        life: 5000,
      })
    } else {
      console.error(message)
    }
  } finally {
    isCreatingSheet.value = false
  }
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
  if (hasFilter.value) {
    trackEvent('filter_applied')
    fetchPersons()
  }
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
        <Button v-if="canWritePerson" label="New Person" icon="pi pi-plus" @click="$router.push({ name: 'meta-person-create' })" />
        <Button v-if="canWritePerson" label="Import Application" icon="pi pi-file-import" severity="secondary"
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
      paginator
      :rows="pageRows"
      class="person-table"
      :pt="{ tableContainer: { style: 'overflow: visible;' }, thead: { style: 'top: var(--breadcrumb-height); z-index: 1;' } }"
      @row-click="(event) => navigateToPerson(event.data.personId, event.data.fullName)"
    >
      <template #paginatorcontainer="{ first, last, page, pageCount, prevPageCallback, nextPageCallback, totalRecords }">
        <div class="paginator-container">
          <Button icon="pi pi-chevron-left" text rounded @click="prevPageCallback" :disabled="page === 0" />
          <span class="paginator-info">{{ first }}–{{ last }} of {{ totalRecords }}</span>
          <Button icon="pi pi-chevron-right" text rounded @click="nextPageCallback" :disabled="page === pageCount - 1" />
          <Select v-model="pageRows" :options="[10, 25, 50, 100]" />
          <ExportButton
            :disabled="isLoading || isCreatingSheet || isFetchingExport"
            @download="handleDownloadCsv"
            @export="handleCreateSheet"
          />
        </div>
      </template>

      <Column field="fullName" header="Name" sortable style="width: 20%" />
      <Column field="village.name" header="Village" sortable style="width: 15%" />
      <Column header="Roles" style="width: 15%">
        <template #body="{ data }">
          <div class="role-tags">
            <Tag
              v-for="role in parseJson(data.activeAs)"
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
