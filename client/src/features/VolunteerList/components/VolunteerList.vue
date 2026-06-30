<script setup>
import { computed, ref, watch, onMounted, onActivated, onDeactivated } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import ExportButton from '../../../components/ExportButton.vue'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useDebouncedRef } from '../../../shared/composables/useDebouncedRef.js'
import { getVillageVolunteers } from '../api/volunteerApi.js'
import { getVillagePersons } from '../../../shared/api/villageApi.js'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { setPendingHighlight, consumePendingHighlight } from '../../../shared/lib/pendingHighlight.js'
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
const pageRows = ref(10)
const selectedCapabilities = ref([])
const sortField = ref('fullName')
const sortDir = ref('asc')
const capabilityOptions = ['Errands', 'Friends', 'Home Help', 'Rides', 'Tech Support']

const { state: volunteers, isLoading, error, execute: fetchVolunteers } = useAsyncState(
  () => villageId.value ? getVillageVolunteers(villageId.value) : null,
  { immediate: true }
)

const { state: persons, execute: fetchPersons } = useAsyncState(
  () => villageId.value ? getVillagePersons(villageId.value) : null,
  { immediate: false }
)

const flashRowId = ref(null)
const navigatedToDetail = ref(false)
const villageIdWhenNavigatedAway = ref(null)
const hasActivatedOnce = ref(false)
const fetchedByWatch = ref(false)
const { pause: pauseVillageWatch, resume: resumeVillageWatch } = watch(() => route.params.villageId, () => {
  fetchedByWatch.value = true
  searchText.immediate('')
  selectedCapabilities.value = []
  fetchVolunteers()
  persons.value = null
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
    const id = consumePendingHighlight()
    if (id) {
      flashRowId.value = id
      setTimeout(() => { flashRowId.value = null }, 2000)
    }
    return
  }
  navigatedToDetail.value = false
  searchText.immediate('')
  selectedCapabilities.value = []
  fetchVolunteers()
  persons.value = null
})

const filteredVolunteers = computed(() => {
  if (!Array.isArray(volunteers.value)) return []

  let result = volunteers.value.filter(v => {
    // Filter by name
    const nameMatch = v.fullName?.toLowerCase().includes(searchText.value.toLowerCase())

    // Filter by capabilities
    let capabilityMatch = true
    if (selectedCapabilities.value.length > 0) {
      capabilityMatch = selectedCapabilities.value.some(cap =>
        v.capabilities?.includes(cap)
      )
    }

    return nameMatch && capabilityMatch
  })

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
  if (!Array.isArray(volunteers.value) || !Array.isArray(persons.value)) return []
  return volunteers.value.map(v => {
    const p = persons.value?.find(p => p.personId === v.personId) ?? {}
    return { ...p, ...v, capabilities: v.capabilities?.join('; ') ?? '' }
  })
})

const clearSearch = () => searchText.immediate('')

const navigateToVolunteer = (volunteer) => {
  setPendingHighlight(volunteer.personId)
  navigatedToDetail.value = true
  villageIdWhenNavigatedAway.value = villageId.value
  router.push({
    name: 'volunteer-detail',
    params: { villageId: villageId.value, personId: volunteer.personId }
  })
}

const columnsForCsv = [
  { header: 'Full Name', key: 'fullName' },
  { header: 'Capabilities', key: 'capabilities' },
  { header: 'Email', key: 'email' },
  { header: 'Phone', key: 'phone' },
  { header: 'Cell', key: 'cell' },
  { header: 'Address', key: 'address' },
  { header: 'City', key: 'city' },
  { header: 'State', key: 'state' },
  { header: 'Zip', key: 'zip' },
  { header: 'Birth Date', key: 'birthDate' },
  { header: 'Emergency Contact Name', key: 'emergencyContactName' },
  { header: 'Emergency Contact Relationship', key: 'emergencyContactRelationship' },
  { header: 'Emergency Contact Phone', key: 'emergencyContactPhone' },
  { header: 'Emergency Contact Email', key: 'emergencyContactEmail' }
]

const handleDownloadCsv = async () => {
  if (!persons.value) await fetchPersons()
  const csv = toCsv(volunteersForCsv.value, columnsForCsv)
  const villageName = persons.value?.[0]?.village?.name || 'village'
  const filename = `${villageName}-volunteers.csv`
  downloadCsv(csv, filename)
}

async function handleCreateSheet() {
  try {
    isCreatingSheet.value = true

    if (!persons.value) await fetchPersons()
    const villageName = persons.value?.[0]?.village?.name || 'Village Green'
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
      <div class="header-controls">
        <IconField>
          <InputText
            v-model="searchText"
            type="text"
            placeholder="Search by name..."
          />
          <InputIcon v-if="searchText" class="pi pi-times" style="cursor: pointer" @click.stop="clearSearch" />
        </IconField>
        <div class="capability-filters">
          <div
            v-for="capability in capabilityOptions"
            :key="capability"
            class="capability-filter"
          >
            <Checkbox
              v-model="selectedCapabilities"
              :input-id="`capability-${capability}`"
              :value="capability"
            />
            <label :for="`capability-${capability}`">{{ capability }}</label>
          </div>
        </div>
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
      rowHover
      paginator
      :rows="pageRows"
      class="volunteer-table-responsive desktop-only"
      :pt="{
        tableContainer: { style: 'overflow: visible;' },
        thead: { style: 'top: var(--breadcrumb-height); z-index: 1;' },
        headerRow: { style: 'background: var(--color-background-light);' },
        bodyRow: { style: { cursor: 'pointer' } }
      }"
      :row-class="(row) => row.personId === flashRowId ? 'row-flash' : null"
      @row-click="(event) => navigateToVolunteer(event.data)"
      @filter="trackEvent('filter_applied')"
    >
      <Column field="fullName" header="Name" sortable style="width: 50%"></Column>
      <Column header="Capabilities" style="width: 50%">
        <template #body="slotProps">
          <div class="capabilities-list">
            <Tag
              v-for="cap in slotProps.data.capabilities"
              :key="cap"
              :value="cap"
              class="capability-badge"
            />
            <span v-if="!slotProps.data.capabilities?.length" class="no-capabilities">
              —
            </span>
          </div>
        </template>
      </Column>
      <template #paginatorcontainer="{ first, last, page, pageCount, prevPageCallback, nextPageCallback, totalRecords }">
        <div class="paginator-container">
          <Button icon="pi pi-chevron-left" text rounded @click="prevPageCallback" :disabled="page === 0" />
          <span class="paginator-info">{{ first }}–{{ last }} of {{ totalRecords }}</span>
          <Button icon="pi pi-chevron-right" text rounded @click="nextPageCallback" :disabled="page === pageCount - 1" />
          <Select v-model="pageRows" :options="[10, 25, 50, 100]" />
          <ExportButton
            :disabled="isLoading || isCreatingSheet"
            @download="handleDownloadCsv"
            @export="handleCreateSheet"
          />
        </div>
      </template>
    </DataTable>

    <!-- Mobile Card List -->
    <div class="volunteer-cards mobile-only">
      <div
        v-for="volunteer in filteredVolunteers"
        :key="volunteer.volunteerId"
        class="volunteer-card"
        :class="{ 'row-flash': volunteer.personId === flashRowId }"
        @click="navigateToVolunteer(volunteer)"
      >
        <h3>{{ volunteer.fullName }}</h3>
        <div class="card-row">
          <span class="label">Capabilities:</span>
          <div v-if="volunteer.capabilities?.length" class="capabilities-list">
            <span
              v-for="cap in volunteer.capabilities"
              :key="cap"
              class="capability-badge"
            >
              {{ cap }}
            </span>
          </div>
          <span v-else class="no-capabilities">None listed</span>
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
  margin-bottom: 1rem;
}

h1 {
  margin: 0;
  color: var(--color-text-primary);
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
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
  box-shadow: var(--box-shadow-card);
  border: 1px solid var(--color-border-default);
}

:deep(tr.row-flash td) { animation: row-flash-anim 2s ease-out; }

/* Capabilities Badge */
.capabilities-list {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.5rem;
  overflow: hidden;
}

.capability-badge {
  display: inline-block;
  padding: 0.3rem 0.6rem;
  background-color: var(--color-background-dark);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  font-size: 0.9rem;
  color: var(--color-text-dim);
}

.no-capabilities {
  color: var(--color-text-dim);
  padding: 0.25rem 0.6rem;

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

.paginator-container { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; }
.paginator-info { font-size: 0.9rem; color: var(--color-text-dim); min-width: 100px; text-align: center; }

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
