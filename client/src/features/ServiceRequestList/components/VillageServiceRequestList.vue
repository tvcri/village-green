<script setup>
import { computed, ref, watch, onMounted, onActivated, onDeactivated } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import NotificationHistoryDialog from './NotificationHistoryDialog.vue'
import ServiceRequestTable from './ServiceRequestTable.vue'
import { useToast } from 'primevue/usetoast'
import ExportButton from '../../../components/ExportButton.vue'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getVillageServiceRequests } from '../api/serviceRequestApi.js'
import { apiCall } from '../../../shared/api/apiClient.js'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { createSheet } from '../../../shared/services/googleSheetsService.js'
import { useAnalytics } from '../../../shared/composables/useAnalytics.js'

defineOptions({ name: 'VillageServiceRequestList' })

const { trackEvent } = useAnalytics()

const router = useRouter()
const route = useRoute()

let toast = null
onMounted(() => { toast = useToast() })

useScrollRestore('service-requests', 'service-request-detail')

const villageId = computed(() => route.params.villageId)

const isCreatingSheet = ref(false)
const filtersCollapsed = ref(true)
const selectedMember = ref('All members')
const selectedVolunteer = ref('All volunteers')
const selectedService = ref('All services')
const idSearch = ref('')
const historyDialogVisible = ref(false)
const historyRequestId = ref(null)
const historyRequestLabel = ref(null)

const openHistory = (row) => {
  historyRequestId.value = row.serviceRequestId
  historyRequestLabel.value = row.displayNumber
  historyDialogVisible.value = true
}

const selectedStatuses = ref(['open', 'confirmed'])

const { state: requests, isLoading, error, execute: fetchRequests } = useAsyncState(
  () => villageId.value ? getVillageServiceRequests(villageId.value) : null,
  { immediate: true }
)

const { state: village, execute: fetchVillage } = useAsyncState(
  () => villageId.value ? apiCall('getVillage', { villageId: villageId.value }) : null,
  { immediate: false }
)

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
    return
  }
  fetchRequests()
})

const hasLoadedOnce = ref(false)
watch(requests, (val) => { if (val !== null) hasLoadedOnce.value = true })

const statusOptions = ['open', 'confirmed', 'draft', 'completed', 'unmatched', 'cancelled']

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
  return requests.value.filter(r => {
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
    let idMatch = true
    const idQuery = idSearch.value.trim().toLowerCase()
    if (idQuery) {
      const displayedId = String(r.displayNumber ?? '').toLowerCase()
      idMatch = displayedId.includes(idQuery)
    }
    let statusMatch = true
    if (selectedStatuses.value.length > 0) {
      const statusLower = r.status?.toLowerCase() || ''
      statusMatch = selectedStatuses.value.some(s => {
        const sl = s.toLowerCase()
        if (sl === 'cancelled') return statusLower.includes('cancelled')
        return statusLower === sl
      })
    }
    return memberMatch && volunteerMatch && serviceMatch && statusMatch && idMatch
  })
})

const isEmpty = computed(() => !isLoading.value && filteredRequests.value.length === 0)

const activeFilterCount = computed(() => {
  let count = 0
  if (selectedMember.value && selectedMember.value !== 'All members') count++
  if (selectedVolunteer.value && selectedVolunteer.value !== 'All volunteers') count++
  if (selectedService.value && selectedService.value !== 'All services') count++
  if (idSearch.value.trim()) count++
  return count
})

const columnsForCsv = [
  { header: 'Request #', key: 'displayNumber' },
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
  downloadCsv(csv, `${villageName}-service-requests.csv`)
}

async function handleCreateSheet() {
  try {
    isCreatingSheet.value = true
    if (!village.value && villageId.value) await fetchVillage()
    const villageName = village.value?.name || 'Village Green'
    const result = await createSheet(requests.value || [], columnsForCsv, `${villageName} Service Requests`)
    const sheetUrl = result.url || result
    if (result.popupBlocked) {
      if (toast) {
        toast.add({
          severity: 'success',
          summary: 'Sheet Created',
          detail: `Your Google Sheet has been created. <a href="${sheetUrl}" target="_blank" style="color: inherit; text-decoration: underline;">Open it here</a>.`,
          life: 0,
        })
      }
    } else {
      if (toast) {
        toast.add({ severity: 'success', summary: 'Sheet Created', detail: 'Your Google Sheet has been created and opened in a new tab.', life: 3000 })
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
      toast.add({ severity: 'error', summary: 'Sheet Creation Failed', detail: message, life: 5000 })
    }
  } finally {
    isCreatingSheet.value = false
  }
}

const navigateToRequest = (serviceRequestId, rowVillageId) => {
  router.push({ name: 'service-request-detail', params: { villageId: rowVillageId ?? villageId.value, id: serviceRequestId } })
}

const clearFilters = () => {
  selectedMember.value = 'All members'
  selectedVolunteer.value = 'All volunteers'
  selectedService.value = 'All services'
  selectedStatuses.value = []
  idSearch.value = ''
}
</script>

<template>
  <div class="service-request-list">
    <div class="header-row">
      <div class="title-group">
        <h1>Service Requests</h1>
      </div>
      <div class="header-actions">
        <ExportButton
          :disabled="isLoading || isCreatingSheet"
          @download="handleDownloadCsv"
          @export="handleCreateSheet"
        />
      </div>
    </div>

    <div class="filter-section">
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
          <div class="status-id-row">
            <div class="status-filter-group">
              <label class="filter-group-label">Status:</label>
              <div class="status-filters">
                <div v-for="status in statusOptions" :key="status" class="status-filter">
                  <Checkbox v-model="selectedStatuses" :input-id="`status-${status}`" :value="status" />
                  <label :for="`status-${status}`">{{ status.charAt(0).toUpperCase() + status.slice(1) }}</label>
                </div>
              </div>
            </div>
            <div class="search-box">
              <label>Request ID / #:</label>
              <InputText v-model="idSearch" placeholder="Search by ID or number" />
            </div>
          </div>

          <div class="search-box">
            <label>Member:</label>
            <Select v-model="selectedMember" :options="memberOptions" placeholder="-- Select member --" />
          </div>
          <div class="search-box">
            <label>Volunteer:</label>
            <Select v-model="selectedVolunteer" :options="volunteerOptions" placeholder="-- Select volunteer --" />
          </div>
          <div class="search-box">
            <label>Service:</label>
            <Select v-model="selectedService" :options="serviceOptions" placeholder="-- Select service --" />
          </div>
        </div>
      </div>
    </div>

    <ServiceRequestTable
      :rows="filteredRequests"
      :is-loading="isLoading"
      :has-loaded-once="hasLoadedOnce"
      :error="error"
      @row-click="(event) => navigateToRequest(event.data.serviceRequestId, event.data.villageId)"
    >
      <template #actions="{ data }">
        <Button
          icon="pi pi-bell"
          class="p-button-rounded p-button-text p-button-sm"
          aria-label="Notification history"
          @click.stop="openHistory(data)"
        />
      </template>
    </ServiceRequestTable>

    <NotificationHistoryDialog
      v-model:visible="historyDialogVisible"
      :service-request-id="historyRequestId"
      :display-label="historyRequestLabel"
    />
  </div>
</template>

<style scoped>
.service-request-list { padding: 2rem; }
.header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
.title-group { display: flex; flex-direction: column; gap: 0.25rem; }
h1 { margin: 1rem 0 0 0; color: var(--color-text-primary); }
.header-actions { display: flex; align-items: center; gap: 1rem; }
.filter-section { margin-bottom: 1.5rem; padding: 1rem 0; background-color: var(--color-background-primary); border-bottom: 1px solid var(--color-border-default); width: 100%; display: flex; flex-direction: column; gap: 1rem; }
.filters-container { display: flex; flex-direction: column; gap: 0; }
.filters-header { display: flex; align-items: center; gap: 0.5rem; }
.filters-toggle { display: flex; align-items: center; gap: 0.75rem; flex: 1; padding: 0.75rem; background: none; border: none; cursor: pointer; font-size: 1rem; text-align: left; color: var(--color-text-primary); font-weight: 500; transition: background-color 0.2s ease; min-height: 3rem; }
.filters-toggle:hover { background-color: var(--color-background-subtle); border-radius: 4px; }
.toggle-icon { display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; transition: transform 0.2s ease; color: var(--color-text-dim); flex-shrink: 0; }
.filters-toggle .toggle-icon { transform: rotate(0deg); }
.filters-toggle.collapsed .toggle-icon { transform: rotate(-90deg); }
.filters-title { display: flex; align-items: center; gap: 0.5rem; font-weight: 500; color: var(--color-text-primary); }
.filter-count-tag { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.75rem; background-color: var(--color-background-subtle); border: 1px solid var(--color-border-default); border-radius: 12px; font-size: 0.8rem; color: var(--color-text-dim); font-weight: 500; white-space: nowrap; }
.clear-filters-icon { display: inline-flex; align-items: center; justify-content: center; margin-left: 0.5rem; cursor: pointer; color: var(--color-text-dim); font-size: 0.75rem; font-weight: bold; line-height: 1; transition: color 0.2s ease; }
.clear-filters-icon:hover { color: var(--color-text-primary); }
.filters-content { display: flex; gap: 2rem; flex-wrap: wrap; align-items: flex-start; padding: 1rem; background-color: var(--color-background-light); border: 1px solid var(--color-border-default); border-radius: 4px; }
.status-id-row { display: flex; gap: 2rem; align-items: flex-start; flex: 1 1 100%; }
.status-id-row .status-filter-group { flex: 1 1 auto; }
.status-filter-group { display: flex; flex-direction: column; gap: 0.5rem; flex: 1 1 100%; }
.filter-group-label { font-weight: 500; color: var(--color-text-primary); font-size: 0.9rem; }
.filters-content .search-box { display: flex; flex-direction: column; gap: 0.5rem; min-width: 160px; }
.filters-content .search-box label { font-weight: 500; color: var(--color-text-primary); font-size: 0.9rem; }
.status-filters { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.status-filter { display: flex; align-items: center; gap: 0.375rem; }
@media (max-width: 768px) {
  .service-request-list { padding: 1rem; }
}
</style>
