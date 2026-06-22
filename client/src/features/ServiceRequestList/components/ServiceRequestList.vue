<script setup>
import { computed, ref, watch, onMounted, onActivated, onDeactivated } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import ExportButton from '../../../components/ExportButton.vue'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useCeDumpRefresh } from '../../../shared/composables/useCeDumpRefresh.js'
import { getVillageServiceRequests, getServiceRequests } from '../api/serviceRequestApi.js'
import { apiCall } from '../../../shared/api/apiClient.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { createSheet } from '../../../shared/services/googleSheetsService.js'
import { useAnalytics } from '../../../shared/composables/useAnalytics.js'

defineOptions({ name: 'ServiceRequestList' })

const { trackEvent } = useAnalytics()

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString()
}

const router = useRouter()
const route = useRoute()

let toast = null

onMounted(() => {
  toast = useToast()
})

useScrollRestore(
  route.name === 'meta-service-requests' ? 'meta-service-requests' : 'service-requests',
  'service-request-detail'
)

const villageId = computed(() => route.params.villageId)
const isMetaMode = computed(() => !route.params.villageId)
const selectedVillage = ref('All villages')
const isCreatingSheet = ref(false)
const filtersCollapsed = ref(true)
const selectedMember = ref('All members')
const selectedVolunteer = ref('All volunteers')
const selectedService = ref('All services')
const selectedStatuses = ref(['open', 'confirmed'])
const sortField = ref('startAt')
const sortDir = ref('asc')

const { state: requests, isLoading, error, execute: fetchRequests } = useAsyncState(
  () => {
    if (isMetaMode.value) {
      return getServiceRequests({
        status: selectedStatuses.value,
        villageId: selectedVillage.value !== 'All villages'
          ? [(allVillages.value ?? []).find(v => v.name === selectedVillage.value)?.villageId].filter(Boolean)
          : []
      })
    }
    return villageId.value ? getVillageServiceRequests(villageId.value) : null
  },
  { immediate: true }
)

const { state: village, execute: fetchVillage } = useAsyncState(
  () => villageId.value ? apiCall('getVillage', { villageId: villageId.value }) : null,
  { immediate: false }
)

const { state: allVillages } = useAsyncState(
  () => isMetaMode.value ? getVillages() : null,
  { immediate: true }
)

useCeDumpRefresh(() => fetchRequests())
const navigatedToDetail = ref(false)
const villageIdWhenNavigatedAway = ref(null)
const hasActivatedOnce = ref(false)
const villageIdAtDeactivation = ref(null)
const { pause: pauseVillageWatch, resume: resumeVillageWatch } = watch(() => route.params.villageId, () => {
  selectedMember.value = 'All members'
  selectedVolunteer.value = 'All volunteers'
  selectedService.value = 'All services'
  selectedStatuses.value = ['open', 'confirmed']
  fetchRequests()
  village.value = null
})
onDeactivated(() => {
  pauseVillageWatch()
  villageIdAtDeactivation.value = villageId.value
})
onActivated(() => {
  resumeVillageWatch()
  if (!hasActivatedOnce.value) {
    hasActivatedOnce.value = true
    return
  }
  const villageChanged = villageId.value !== villageIdAtDeactivation.value
  if (villageChanged) {
    // watch will fire and handle the fetch
    return
  }
  if (navigatedToDetail.value) {
    navigatedToDetail.value = false
    return
  }
  navigatedToDetail.value = false
  selectedMember.value = 'All members'
  selectedVolunteer.value = 'All volunteers'
  selectedService.value = 'All services'
  selectedStatuses.value = ['open', 'confirmed']
  fetchRequests()
  village.value = null
})

watch([selectedStatuses, selectedVillage], () => {
  if (isMetaMode.value) fetchRequests()
})

const hasLoadedOnce = ref(false)
watch(requests, (val) => { if (val !== null) hasLoadedOnce.value = true })

const statusOptions = ['open', 'confirmed', 'completed', 'unmatched', 'cancelled']

const memberOptions = computed(() => {
  if (!Array.isArray(requests.value)) return []
  const members = new Set(requests.value.map(r => r.memberFullName).filter(Boolean))
  return ['All members', ...Array.from(members).sort()]
})

const volunteerOptions = computed(() => {
  if (!Array.isArray(requests.value)) return []
  const volunteers = new Set(requests.value.map(r => r.volunteerFullName).filter(Boolean))
  return ['All volunteers', ...Array.from(volunteers).sort()]
})

const serviceOptions = computed(() => {
  if (!Array.isArray(requests.value)) return []
  const services = new Set(requests.value.map(r => r.serviceName).filter(Boolean))
  return ['All services', ...Array.from(services).sort()]
})

const filteredRequests = computed(() => {
  if (!Array.isArray(requests.value)) return []

  let result = requests.value.filter(r => {
    let memberMatch = true
    if (selectedMember.value && selectedMember.value !== 'All members') {
      memberMatch = r.memberFullName === selectedMember.value
    }

    let volunteerMatch = true
    if (selectedVolunteer.value && selectedVolunteer.value !== 'All volunteers') {
      volunteerMatch = r.volunteerFullName === selectedVolunteer.value
    }

    let serviceMatch = true
    if (selectedService.value && selectedService.value !== 'All services') {
      serviceMatch = r.serviceName === selectedService.value
    }

    // In village mode: client-side status filter. In meta mode: already server-filtered.
    let statusMatch = true
    if (!isMetaMode.value && selectedStatuses.value.length > 0) {
      const statusLower = r.status?.toLowerCase() || ''
      statusMatch = selectedStatuses.value.some(selectedStatus => {
        const selectedLower = selectedStatus.toLowerCase()
        if (selectedLower === 'cancelled') return statusLower.includes('cancelled')
        return statusLower === selectedLower
      })
    }

    return memberMatch && volunteerMatch && serviceMatch && statusMatch
  })

  result.sort((a, b) => {
    const aVal = a[sortField.value] ?? ''
    const bVal = b[sortField.value] ?? ''
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDir.value === 'asc' ? cmp : -cmp
  })

  return result
})

const isEmpty = computed(() => !isLoading.value && filteredRequests.value.length === 0)

const activeFilterCount = computed(() => {
  let count = 0
  if (selectedMember.value && selectedMember.value !== 'All members') count++
  if (selectedVolunteer.value && selectedVolunteer.value !== 'All volunteers') count++
  if (selectedService.value && selectedService.value !== 'All services') count++
  if (selectedVillage.value && selectedVillage.value !== 'All villages') count++
  return count
})

const toggleSort = (field) => {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = 'asc'
  }
}

const onSort = (event) => {
  sortField.value = event.sortField
  sortDir.value = event.sortOrder === 1 ? 'asc' : 'desc'
}

const toggleStatus = (status) => {
  const idx = selectedStatuses.value.indexOf(status)
  if (idx >= 0) {
    selectedStatuses.value.splice(idx, 1)
  } else {
    selectedStatuses.value.push(status)
  }
}

const getStatusSeverity = (status) => {
  const statusLower = status?.toLowerCase() || ''
  if (statusLower.includes('cancelled')) {
    return 'danger' // light red
  }
  switch (statusLower) {
    case 'open':
      return 'warn' // orange
    case 'confirmed':
      return 'info' // cyan
    case 'completed':
      return 'success' // green
    case 'unmatched':
      return 'secondary' // black/gray
    default:
      return 'info'
  }
}

const columnsForCsv = [
  { header: 'Request #', key: 'requestNumber' },
  { header: 'Status', key: 'status' },
  { header: 'Service', key: 'serviceName' },
  { header: 'Member', key: 'memberFullName' },
  { header: 'Volunteer', key: 'volunteerFullName' },
  { header: 'Start At', key: 'startAt' },
  { header: 'Finish At', key: 'finishAt' },
  { header: 'Transportation Type', key: 'transportationType' },
  { header: 'Destination', key: 'destination' },
  { header: 'Address', key: 'address' },
  { header: 'City', key: 'city' },
  { header: 'Phone', key: 'phone' },
  { header: 'Description', key: 'description' },
  { header: 'Created At', key: 'createdAt' }
]

const handleDownloadCsv = async () => {
  if (!village.value && villageId.value) await fetchVillage()
  const csv = toCsv(requests.value || [], columnsForCsv)
  const villageName = village.value?.name || 'village'
  const filename = `${villageName}-service-requests.csv`
  downloadCsv(csv, filename)
}

async function handleCreateSheet() {
  try {
    isCreatingSheet.value = true

    if (!village.value && villageId.value) await fetchVillage()
    const villageName = village.value?.name || 'Village Green'
    const sheetName = `${villageName} Service Requests`

    const result = await createSheet(
      requests.value || [],
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

const navigateToRequest = (serviceRequestId, rowVillageId) => {
  navigatedToDetail.value = true
  villageIdWhenNavigatedAway.value = villageId.value
  const params = { villageId: rowVillageId ?? villageId.value, id: serviceRequestId }
  const query = isMetaMode.value ? { from: 'meta' } : {}
  router.push({ name: 'service-request-detail', params, query })
}

const navigateToCreateRequest = () => {
  navigatedToDetail.value = true
  router.push({ name: 'meta-service-request-create' })
}

const clearFilters = () => {
  selectedMember.value = 'All members'
  selectedVolunteer.value = 'All volunteers'
  selectedService.value = 'All services'
  selectedStatuses.value = []
  selectedVillage.value = 'All villages'
}
</script>

<template>
  <div class="service-request-list">
    <div class="header-row">
      <div class="title-group">
        <h1>Service Requests</h1>
        <span class="subtitle">Last 30 days</span>
      </div>
      <div class="header-actions">
        <Button
          v-if="isMetaMode"
          label="New Request"
          icon="pi pi-plus"
          @click="navigateToCreateRequest"
        />
        <ExportButton
          :disabled="isLoading || isCreatingSheet"
          @download="handleDownloadCsv"
          @export="handleCreateSheet"
        />
      </div>
    </div>

    <div class="filter-section">
      <!-- Filters (Collapsible) -->
      <div class="filters-container">
        <div class="filters-header">
          <button
            type="button"
            class="filters-toggle"
            :class="{ collapsed: filtersCollapsed }"
            @click="filtersCollapsed = !filtersCollapsed"
          >
            <span class="toggle-icon">▼</span>
            <span class="filters-title">
              Filters
              <span v-if="requests && requests.length && (filteredRequests.length < requests.length || activeFilterCount > 0)" class="filter-count-tag">
                {{ filteredRequests.length }} of {{ requests.length }} requests
                <span
                  role="button"
                  class="clear-filters-icon"
                  @click.stop.prevent="clearFilters()"
                  @keydown.enter.stop.prevent="clearFilters()"
                  @keydown.space.stop.prevent="clearFilters()"
                  tabindex="0"
                  title="Clear all filters"
                >
                  ✕
                </span>
              </span>
            </span>
          </button>
        </div>

        <div v-if="!filtersCollapsed" class="filters-content">
          <!-- Status Filter -->
          <div class="status-filter-group">
            <label class="filter-group-label">Status:</label>
            <div class="status-filters">
              <div
                v-for="status in statusOptions"
                :key="status"
                class="status-filter"
              >
                <Checkbox
                  v-model="selectedStatuses"
                  :input-id="`status-${status}`"
                  :value="status"
                />
                <label :for="`status-${status}`">{{ status.charAt(0).toUpperCase() + status.slice(1) }}</label>
              </div>
            </div>
          </div>

          <!-- Member Filter -->
          <div class="search-box">
            <label>Member:</label>
            <Select
              v-model="selectedMember"
              :options="memberOptions"
              placeholder="-- Select member --"
            />
          </div>

          <!-- Volunteer Filter -->
          <div class="search-box">
            <label>Volunteer:</label>
            <Select
              v-model="selectedVolunteer"
              :options="volunteerOptions"
              placeholder="-- Select volunteer --"
            />
          </div>

          <!-- Service Filter -->
          <div class="search-box">
            <label>Service:</label>
            <Select
              v-model="selectedService"
              :options="serviceOptions"
              placeholder="-- Select service --"
              @change="selectedService = selectedService"
            />
          </div>

          <!-- Village Filter (meta mode only) -->
          <div v-if="isMetaMode" class="search-box">
            <label>Village:</label>
            <Select
              v-model="selectedVillage"
              :options="['All villages', ...(allVillages ?? []).map(v => v.name)]"
              placeholder="-- All villages --"
            />
          </div>
        </div>
      </div>
    </div>

    <div v-if="isLoading && !hasLoadedOnce" class="loading-state">
      <p>Loading service requests...</p>
    </div>

    <div v-else-if="error && !hasLoadedOnce" class="error-state">
      <p>Unable to load service requests. Please try again.</p>
    </div>

    <div v-else-if="isEmpty" class="empty-state">
      <p>No service requests found</p>
    </div>

    <!-- Desktop Table -->
    <DataTable
      v-else
      :value="filteredRequests"
      :sortField="sortField"
      :sortOrder="sortDir === 'asc' ? 1 : -1"
      class="request-table-responsive desktop-only"
      :pt="{ tableContainer: { style: 'overflow: visible;' }, thead: { style: 'top: var(--breadcrumb-height); z-index: 1;' }, headerRow: { style: 'background: var(--color-background-light);' } }"
      @row-click="(event) => navigateToRequest(event.data.serviceRequestId, event.data.villageId)"
      @sort="onSort"
      @filter="trackEvent('filter_applied')"
    >
      <Column field="startAt" header="Date" sortable style="width: 12%">
        <template #body="slotProps">
          {{ slotProps.data.startAt ? formatDate(slotProps.data.startAt) : '—' }}
        </template>
      </Column>
      <Column v-if="isMetaMode" field="villageName" header="Village" sortable style="width: 15%"></Column>
      <Column field="serviceName" header="Service" sortable style="width: 20%"></Column>
      <Column field="status" header="Status" sortable style="width: 12%">
        <template #body="slotProps">
          <Tag
            :value="slotProps.data.status"
            :severity="getStatusSeverity(slotProps.data.status)"
          />
        </template>
      </Column>
      <Column field="memberFullName" header="Member" sortable style="width: 15%"></Column>
      <Column field="volunteerFullName" header="Volunteer" sortable style="width: 15%"></Column>
      <Column field="city" header="City" sortable style="width: 13%"></Column>
      <Column field="requestNumber" header="#" sortable style="width: 10%"></Column>
    </DataTable>

    <!-- Mobile Card List -->
    <div class="request-cards mobile-only">
      <div
        v-for="request in filteredRequests"
        :key="request.serviceRequestId"
        class="request-card"
        @click="navigateToRequest(request.serviceRequestId, request.villageId)"
      >
        <div class="card-header">
          <h3>{{ request.serviceName ?? 'Service Request' }}</h3>
          <span class="status-badge" :data-status="request.status">
            {{ request.status ?? '—' }}
          </span>
        </div>
        <div class="card-row">
          <span class="label">#:</span>
          <span>{{ request.requestNumber ?? '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">Member:</span>
          <span>{{ request.memberFullName ?? '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">Volunteer:</span>
          <span>{{ request.volunteerFullName ?? '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">Start:</span>
          <span>{{ request.startAt ? formatDate(request.startAt) : '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">City:</span>
          <span>{{ request.city ?? '—' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>


<style scoped>
.service-request-list {
  padding: 2rem;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.title-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

h1 {
  margin: 1rem 0 0 0;
  color: var(--color-text-primary);
}

.subtitle {
  font-size: 0.85rem;
  color: var(--color-text-dim);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.filter-section {
  margin-bottom: 1.5rem;
  padding: 1rem 0;
  background-color: var(--color-background-primary);
  border-bottom: 1px solid var(--color-border-default);
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.filters-container {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.filters-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filters-toggle {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  padding: 0.75rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  text-align: left;
  color: var(--color-text-primary);
  font-weight: 500;
  transition: background-color 0.2s ease;
  min-height: 3rem;
}

.filters-toggle:hover {
  background-color: var(--color-background-subtle);
  border-radius: 4px;
}

.toggle-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  transition: transform 0.2s ease;
  color: var(--color-text-dim);
  flex-shrink: 0;
}

.filters-toggle .toggle-icon {
  transform: rotate(0deg);
}

.filters-toggle.collapsed .toggle-icon {
  transform: rotate(-90deg);
}

.filters-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.filter-count-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  background-color: var(--color-background-subtle);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  font-size: 0.8rem;
  color: var(--color-text-dim);
  font-weight: 500;
  white-space: nowrap;
}

.clear-filters-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 0.5rem;
  cursor: pointer;
  color: var(--color-text-dim);
  font-size: 0.75rem;
  font-weight: bold;
  line-height: 1;
  transition: color 0.2s ease;
}

.clear-filters-icon:hover {
  color: var(--color-text-primary);
}

.filters-content {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  align-items: flex-start;
  padding: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
}

.status-filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1 1 100%;
}

.filter-group-label {
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.filters-content .search-box {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 0 0 auto;
  width: 250px;
}

.filters-content .search-box label {
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.search-box {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 0 0 auto;
  width: 250px;
}

.search-box label {
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.search-input-group {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.search-input-group :deep(.p-inputtext) {
  flex: 1;
}

.status-box {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-box label {
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.search-input {
  width: 100%;
  padding: 0.75rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.search-input:focus {
  outline: none;
  border-color: var(--p-primary-300);
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.1);
}

.status-filters {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 6px;
}

.status-filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}


.status-filter input[type="checkbox"] {
  cursor: pointer;
}

.status-filter label {
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--color-text-primary);
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

.request-table-responsive {
  cursor: pointer;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  white-space: nowrap;
}

.status-badge[data-status="open"] {
  background-color: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.status-badge[data-status="confirmed"] {
  background-color: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.status-badge[data-status="completed"] {
  background-color: rgba(147, 51, 234, 0.15);
  color: #d8b4fe;
}

.status-badge[data-status="unmatched"] {
  background-color: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}

.status-badge[data-status="cancelled"] {
  background-color: rgba(107, 114, 128, 0.15);
  color: #d1d5db;
}

/* Desktop Table */
.request-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  overflow: hidden;
  font-size: 0.9rem;
}

.request-table thead {
  background-color: var(--color-background-dark);
}

.request-table th {
  padding: 0.75rem;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-default);
}

.request-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.request-table th.sortable:hover {
  background-color: var(--color-background-subtle);
}

.sort-indicator {
  margin-left: 0.3rem;
  font-size: 0.65rem;
  opacity: 0.7;
}

.request-table td {
  padding: 0.75rem;
  border-bottom: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
}

.request-table tbody tr.clickable {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.request-table tbody tr.clickable:hover {
  background-color: var(--color-background-subtle);
}

/* Mobile Card List */
.request-cards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.request-card {
  padding: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.request-card:active {
  background-color: var(--color-background-subtle);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.75rem;
  gap: 0.5rem;
}

.card-header h3 {
  margin: 0;
  font-size: 1rem;
  color: var(--color-text-primary);
  flex: 1;
}

.card-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
}

.card-row .label {
  color: var(--color-text-dim);
  font-weight: 500;
}

/* Responsive */
.desktop-only {
  width: 100%;
}

.mobile-only {
  display: none;
}

@media (max-width: 768px) {
  .service-request-list {
    padding: 1rem;
  }

  .filter-section {
    flex-direction: column;
    gap: 1rem;
  }

  .status-filter-group {
    flex: 1 1 100%;
  }

  .status-filters {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .status-filter {
    width: auto;
  }

  .filters-content {
    flex-direction: column;
    gap: 1rem;
    flex-wrap: nowrap;
  }

  .filters-content .search-box {
    width: 100%;
    flex: 0 0 auto;
  }

  .request-cards {
    overflow-y: auto;
    flex: 1;
  }

  .desktop-only {
    display: none;
  }

  .mobile-only {
    display: flex;
  }
}
</style>
