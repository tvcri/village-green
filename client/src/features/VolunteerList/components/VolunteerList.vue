<script setup>
import { computed, ref, watch, onMounted, onActivated, onDeactivated } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useToast } from 'primevue/usetoast'
import ExportButton from '../../../components/ExportButton.vue'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useDebouncedRef } from '../../../shared/composables/useDebouncedRef.js'
import { getVillageVolunteers } from '../api/volunteerApi.js'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { createSheet } from '../../../shared/services/googleSheetsService.js'
import { useAnalytics } from '../../../shared/composables/useAnalytics.js'

defineOptions({ name: 'VolunteerList' })

const { trackEvent } = useAnalytics()

const router = useRouter()
const route = useRoute()

let toast = null

onMounted(() => {
  toast = useToast()
})

const villageId = computed(() => route.params.villageId)
const isCreatingSheet = ref(false)
const searchText = useDebouncedRef('', 300)
const sortField = ref('fullName')
const sortDir = ref('asc')

const { state: volunteers, isLoading, error, execute: fetchVolunteers } = useAsyncState(
  () => villageId.value ? getVillageVolunteers(villageId.value) : null,
  { immediate: true }
)

useScrollRestore('volunteers', 'volunteer-detail')
const navigatedToDetail = ref(false)
const villageIdWhenNavigatedAway = ref(null)
const hasActivatedOnce = ref(false)
const fetchedByWatch = ref(false)
const { pause: pauseVillageWatch, resume: resumeVillageWatch } = watch(() => route.params.villageId, () => {
  fetchedByWatch.value = true
  searchText.immediate('')
  fetchVolunteers()
})
onDeactivated(pauseVillageWatch)
onActivated(() => {
  resumeVillageWatch()
  if (!hasActivatedOnce.value) {
    hasActivatedOnce.value = true
    return
  }
  if (fetchedByWatch.value) {
    fetchedByWatch.value = false
    return
  }
  if (navigatedToDetail.value && villageId.value === villageIdWhenNavigatedAway.value) {
    navigatedToDetail.value = false
    return
  }
  navigatedToDetail.value = false
  searchText.immediate('')
  fetchVolunteers()
})

const filteredVolunteers = computed(() => {
  if (!Array.isArray(volunteers.value)) return []

  let result = volunteers.value.filter(v =>
    v.fullName?.toLowerCase().includes(searchText.value.toLowerCase())
  )

  result.sort((a, b) => {
    const aVal = a[sortField.value] ?? ''
    const bVal = b[sortField.value] ?? ''
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDir.value === 'asc' ? cmp : -cmp
  })

  return result
})

const isEmpty = computed(() => !isLoading.value && filteredVolunteers.value.length === 0)

const volunteersForCsv = computed(() => {
  if (!Array.isArray(volunteers.value)) return []
  return volunteers.value.map(v => ({
    ...v,
    phone: v.phone?.phone ?? '',
    cell: v.phone?.cell ?? '',
    village: v.village?.name ?? ''
  }))
})

const clearSearch = () => searchText.immediate('')

const navigateToVolunteer = (volunteer) => {
  navigatedToDetail.value = true
  villageIdWhenNavigatedAway.value = villageId.value
  router.push({
    name: 'volunteer-detail',
    params: { villageId: villageId.value, personId: volunteer.personId }
  })
}

const columnsForCsv = [
  { header: 'Full Name', key: 'fullName' },
  { header: 'Village', key: 'village' },
  { header: 'Email', key: 'email' },
  { header: 'Phone', key: 'phone' },
  { header: 'Cell', key: 'cell' }
]

const handleDownloadCsv = async () => {
  const csv = toCsv(volunteersForCsv.value, columnsForCsv)
  const villageName = volunteers.value?.[0]?.village?.name || 'village'
  const filename = `${villageName}-volunteers.csv`
  downloadCsv(csv, filename)
}

async function handleCreateSheet() {
  try {
    isCreatingSheet.value = true

    const villageName = volunteers.value?.[0]?.village?.name || 'Village Green'
    const sheetName = `${villageName} Volunteers`

    const result = await createSheet(
      volunteersForCsv.value,
      columnsForCsv,
      sheetName
    )

    const sheetUrl = result.url || result

    if (result.popupBlocked) {
      // Popup was blocked, show link in toast
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
      // Popup opened successfully
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
</script>

<template>
  <div class="volunteer-list">
    <div class="header-row">
      <h1>Volunteers</h1>
      <ExportButton
        :disabled="isLoading || isCreatingSheet"
        @download="handleDownloadCsv"
        @export="handleCreateSheet"
      />
    </div>

    <div class="filter-section">
      <div class="search-box">
        <IconField style="width: 100%">
          <InputText
            v-model="searchText"
            type="text"
            placeholder="Search by name..."
            style="width: 100%"
          />
          <InputIcon v-if="searchText" class="pi pi-times" style="cursor: pointer" @click.stop="clearSearch" />
        </IconField>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <p>Loading volunteers...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>Unable to load volunteers. Please try again.</p>
    </div>

    <div v-else-if="isEmpty" class="empty-state">
      <p>No volunteers found</p>
    </div>

    <!-- Desktop Table -->
    <DataTable
      v-else
      :value="filteredVolunteers"
      class="volunteer-table-responsive desktop-only"
      :pt="{ tableContainer: { style: 'overflow: visible;' }, thead: { style: 'top: var(--breadcrumb-height); z-index: 1;' } }"
      @row-click="(event) => navigateToVolunteer(event.data)"
      @filter="trackEvent('filter_applied')"
    >
      <Column field="fullName" header="Name" sortable style="width: 50%"></Column>
      <Column field="email" header="Email" sortable style="width: 30%"></Column>
      <Column header="Phone" style="width: 20%">
        <template #body="slotProps">
          {{ slotProps.data.phone?.phone || slotProps.data.phone?.cell || '—' }}
        </template>
      </Column>
    </DataTable>

    <!-- Mobile Card List -->
    <div class="volunteer-cards mobile-only">
      <div
        v-for="volunteer in filteredVolunteers"
        :key="volunteer.personId"
        class="volunteer-card"
        @click="navigateToVolunteer(volunteer)"
      >
        <h3>{{ volunteer.fullName }}</h3>
        <div class="card-row">
          <span class="label">Email:</span>
          <span>{{ volunteer.email ?? '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">Phone:</span>
          <span>{{ volunteer.phone?.phone || volunteer.phone?.cell || '—' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.volunteer-list {
  padding: 2rem;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

h1 {
  margin: 1rem 0 0 0;
  color: var(--color-text-primary);
}

.filter-section {
  margin-bottom: 1.5rem;
  display: flex;
  gap: 1rem;
  align-items: center;
}

.search-and-capabilities {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: stretch;
  width: 100%;
}

.search-box {
  width: 250px;
}

.capability-filters {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: center;
}

.capability-filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.capability-filter label {
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--color-text-primary);
}

.search-input:focus {
  outline: none;
  border-color: var(--p-primary-300);
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.1);
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-dim);
  font-style: italic;
}

.error-state {
  color: var(--color-text-error);
}

.volunteer-table-responsive {
  cursor: pointer;
}

/* Capabilities Badge */
.capabilities-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.capability-badge {
  display: inline-block;
  padding: 0.3rem 0.6rem;
  background-color: var(--color-background-dark);
  border: 1px solid var(--color-border-default);
  border-radius: 3px;
  font-size: 0.8rem;
  color: var(--color-text-dim);
}

.no-capabilities {
  color: var(--color-text-dim);
  font-style: italic;
}

/* Desktop Table */
.volunteer-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  overflow: hidden;
}

.volunteer-table thead {
  background-color: var(--color-background-dark);
}

.volunteer-table th {
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-default);
}

.volunteer-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.volunteer-table th.sortable:hover {
  background-color: var(--color-background-subtle);
}

.sort-indicator {
  margin-left: 0.5rem;
  font-size: 0.75rem;
  opacity: 0.7;
}

.volunteer-table td {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
}

.volunteer-table tbody tr.clickable {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.volunteer-table tbody tr.clickable:hover {
  background-color: var(--color-background-subtle);
}

/* Mobile Card List */
.volunteer-cards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.volunteer-card {
  padding: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.volunteer-card:active {
  background-color: var(--color-background-subtle);
}

.volunteer-card h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  color: var(--color-text-primary);
}

.card-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.card-row .label {
  color: var(--color-text-dim);
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
}

/* Responsive */
.desktop-only {
  width: 100%;
}

.mobile-only {
  display: none;
}

@media (max-width: 768px) {
  .volunteer-list {
    padding: 1rem;
  }

  .header-row {
    flex-direction: row;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
  }

  .header-row h1 {
    margin: 0;
  }

  .header-row :deep(.p-splitbutton) {
    width: auto;
    flex-shrink: 0;
  }

  .search-input {
    max-width: 100%;
  }

  .search-box {
    width: 100%;
  }

  .filter-section {
    flex-direction: column;
    align-items: stretch;
  }

  .desktop-only {
    display: none;
  }

  .mobile-only {
    display: flex;
  }
}
</style>
