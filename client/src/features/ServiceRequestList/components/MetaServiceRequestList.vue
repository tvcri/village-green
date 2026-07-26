<script setup>
import { computed, ref, watch, onMounted, onActivated } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'
import { useCurrentUser } from '../../../shared/composables/useCurrentUser.js'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Button from 'primevue/button'
import Badge from 'primevue/badge'
import NotificationHistoryDialog from './NotificationHistoryDialog.vue'
import ServiceRequestTable from './ServiceRequestTable.vue'
import { useToast } from 'primevue/usetoast'
import ExportButton from '../../../components/ExportButton.vue'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getServiceRequests } from '../api/serviceRequestApi.js'
import { useServiceRequestFilters } from '../composables/useServiceRequestFilters.js'
import { useServiceRequestTabs } from '../composables/useServiceRequestTabs.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { setPendingHighlight, consumePendingHighlight } from '../../../shared/lib/pendingHighlight.js'
import { toCsv, downloadCsv, withLocalDateTimeColumns } from '../../../shared/lib/csvUtils.js'
import { createSheet } from '../../../shared/services/googleSheetsService.js'
defineOptions({ name: 'MetaServiceRequestList' })

const router = useRouter()
const route = useRoute()
const { hasPermission } = useCurrentUser()
const canWriteSr = computed(() => hasPermission('sr:write'))

let toast = null
onMounted(() => { toast = useToast() })

useScrollRestore(
  'meta-service-requests',
  ['service-request-detail', 'meta-service-request-edit', 'meta-service-request-create']
)

// Filter selects use null as "no filter"; the "All ..." text lives in each
// Select's placeholder so show-clear only appears for a real selection.
const selectedVillage = ref(null)
const isCreatingSheet = ref(false)
const filtersCollapsed = ref(true)
const notificationFilter = ref(null)
// TECH DEBT: `vssSignup` is an API-side proxy derived from modifiedUserId
// being non-null; see the board item on recording VSS signup explicitly.
const vssSignupOnly = ref(false)
const historyDialogVisible = ref(false)
const historyRequestId = ref(null)
const historyRequestLabel = ref(null)
const historyRequestStatus = ref(null)

const openHistory = (row) => {
  historyRequestId.value = row.serviceRequestId
  historyRequestLabel.value = row.displayNumber
  historyRequestStatus.value = row.status
  historyDialogVisible.value = true
}

const { state: allVillages } = useAsyncState(
  () => getVillages(),
  { immediate: true }
)

const tabs = useServiceRequestTabs({
  fetcher: (params) => getServiceRequests({
    ...params,
    villageId: selectedVillage.value
      ? [(allVillages.value ?? []).find(v => v.name === selectedVillage.value)?.villageId].filter(Boolean)
      : [],
    hasNotifications: notificationFilter.value === 'Not notified' ? false : undefined
  })
})
const {
  activeTab, historicStart, historicEnd,
  currentRows: requests, isLoading, error, fetchCurrent
} = tabs

const shared = useServiceRequestFilters(requests)
const {
  selectedMember, selectedVolunteer, selectedService, idSearch,
  memberNames: memberOptions, volunteerNames: volunteerOptions,
  serviceNames: serviceOptions, clearAll
} = shared

// The Selects use null as "no filter" (so show-clear only appears for a real
// selection); the composable uses ''. Bridge the two representations.
const nullable = (r) => computed({
  get: () => r.value || null,
  set: (val) => { r.value = val ?? '' }
})
const memberChoice = nullable(selectedMember)
const volunteerChoice = nullable(selectedVolunteer)
const serviceChoice = nullable(selectedService)

// `requests` is a computed over the visible tab, so write through to the
// underlying ref that tab is backed by.
const onNotified = (updated) => {
  const target = activeTab.value === 'active' ? tabs.activeRows : tabs.historicRows
  if (!Array.isArray(target.value)) return
  target.value = target.value.map(r =>
    r.serviceRequestId === updated.serviceRequestId
      ? { ...r, notifications: updated.notificationHistory?.map(e => e.eventType) ?? [] }
      : r
  )
}

const hasActivatedOnce = ref(false)
const flashRowId = ref(null)
const flashTimer = ref(null)

onActivated(async () => {
  if (!hasActivatedOnce.value) {
    hasActivatedOnce.value = true
    return
  }
  await fetchCurrent()
  const id = consumePendingHighlight()
  if (id) {
    flashRowId.value = id
    clearTimeout(flashTimer.value)
    flashTimer.value = setTimeout(() => { flashRowId.value = null }, 2000)
  }
})

// Refetch the visible tab when it is first shown, or when the historic window moves.
watch(activeTab, () => { if (requests.value === null) fetchCurrent() })
watch([historicStart, historicEnd], () => {
  if (activeTab.value === 'historic') fetchCurrent()
})

// Village and notification filters are server-side, so both cached tabs are
// stale when they change.
watch([selectedVillage, notificationFilter], () => {
  tabs.activeRows.value = null
  tabs.historicRows.value = null
  fetchCurrent()
})

onMounted(() => { tabs.fetchActive() })

const hasLoadedOnce = ref(false)
watch(requests, (val) => { if (val !== null) hasLoadedOnce.value = true })

// vssSignup is meta-only, so it composes on top of the shared predicate.
const filteredRequests = computed(() =>
  shared.filteredRows.value.filter(r => !vssSignupOnly.value || r.vssSignup === true))

// The historic window counts as a filter only when narrowed from its default.
const historicStartDefault = historicStart.value
const historicWindowNarrowed = computed(() =>
  activeTab.value === 'historic' &&
  (historicStart.value !== historicStartDefault || !!historicEnd.value))

const activeFilterCount = computed(() => {
  let count = 0
  if (historicWindowNarrowed.value) count++
  if (selectedMember.value) count++
  if (selectedVolunteer.value) count++
  if (selectedService.value) count++
  if (selectedVillage.value) count++
  if (idSearch.value.trim()) count++
  if (notificationFilter.value) count++
  if (vssSignupOnly.value) count++
  return count
})

const columnsForCsv = [
  { header: 'Request #', key: 'displayNumber' },
  { header: 'Village', key: 'villageName' },
  { header: 'Status', key: 'status' },
  { header: 'Service', key: 'serviceName' },
  { header: 'Member', key: 'memberFullName' },
  { header: 'Volunteer', key: 'volunteerFullName' },
  { header: 'Description', key: 'description' },
  { header: 'Date', key: 'serviceDate' },
  { header: 'Start', key: 'startTime' },
  { header: 'Arrive', key: 'apptTime' },
  { header: 'Return', key: 'returnTime' },
  { header: 'Finish', key: 'finishTime' },
  { header: 'Times Flexible', key: 'timesFlexible' },
  { header: 'Destination', key: 'destination' },
  { header: 'Address', key: 'address' },
  { header: 'City', key: 'city' },
  { header: 'State', key: 'state' },
  { header: 'Created At', key: 'createdAt' }
]

const DATE_TIME_CSV_KEYS = ['createdAt']

const handleDownloadCsv = async () => {
  const csv = toCsv(withLocalDateTimeColumns(filteredRequests.value, DATE_TIME_CSV_KEYS), columnsForCsv)
  downloadCsv(csv, 'service-requests.csv')
}

async function handleCreateSheet() {
  try {
    isCreatingSheet.value = true
    const result = await createSheet(withLocalDateTimeColumns(filteredRequests.value, DATE_TIME_CSV_KEYS), columnsForCsv, 'Village Green Service Requests')
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
  setPendingHighlight(serviceRequestId)
  router.push({ name: 'service-request-detail', params: { villageId: rowVillageId, id: serviceRequestId }, query: { from: 'meta' } })
}

const navigateToCreateRequest = () => {
  router.push({ name: 'meta-service-request-create' })
}

const navigateToEditRequest = (serviceRequestId) => {
  setPendingHighlight(serviceRequestId)
  router.push({ name: 'meta-service-request-edit', params: { id: serviceRequestId } })
}

// Both tab panels render the same table; bind one prop object so they cannot drift.
const tableProps = computed(() => ({
  rows: filteredRequests.value,
  isLoading: isLoading.value,
  hasLoadedOnce: hasLoadedOnce.value,
  error: error.value,
  showVillageColumn: true,
  flashRowId: flashRowId.value
}))

const onRowClick = (event) => navigateToRequest(event.data.serviceRequestId, event.data.villageId)

const clearFilters = () => {
  clearAll()
  selectedVillage.value = null
  notificationFilter.value = null
  vssSignupOnly.value = false
  historicStart.value = historicStartDefault
  historicEnd.value = ''
}
</script>

<template>
  <div class="service-request-list">
    <div class="header-row">
      <div class="title-group">
        <h1>Service Requests</h1>
      </div>
      <div class="header-actions">
        <Button v-if="canWriteSr" label="New Request" icon="pi pi-plus" @click="navigateToCreateRequest" />
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
          <Button
            type="button"
            class="filters-btn"
            outlined
            :aria-expanded="!filtersCollapsed"
            @click="filtersCollapsed = !filtersCollapsed"
          >
            <i class="pi pi-filter" aria-hidden="true" />
            <span class="filters-btn-label">Filters</span>
            <Badge v-if="activeFilterCount > 0" :value="activeFilterCount" />
            <i class="pi pi-chevron-down filters-chevron" :class="{ collapsed: filtersCollapsed }" aria-hidden="true" />
          </Button>
          <span v-if="requests && activeFilterCount > 0" class="filter-count-tag">
            {{ filteredRequests.length }} {{ filteredRequests.length === 1 ? 'request' : 'requests' }}
            <span
              role="button"
              class="clear-filters-icon"
              @click.prevent="clearFilters()"
              @keydown.enter.prevent="clearFilters()"
              @keydown.space.prevent="clearFilters()"
              tabindex="0"
              title="Clear all filters"
            >
              ✕
            </span>
          </span>
        </div>

        <div v-if="!filtersCollapsed" class="filters-content">
          <div class="status-filter-group">
            <div class="status-filters">
              <div class="status-filter">
                <Checkbox v-model="vssSignupOnly" input-id="vss-signup-filter" binary />
                <label for="vss-signup-filter">VSS Signup</label>
              </div>
            </div>
          </div>
          <div class="search-box">
            <label>Village:</label>
            <Select
              v-model="selectedVillage"
              :options="(allVillages ?? []).map(v => v.name)"
              placeholder="All villages"
              show-clear
            />
          </div>
          <div class="search-box">
            <label>Member:</label>
            <Select v-model="memberChoice" :options="memberOptions" placeholder="All members" show-clear />
          </div>
          <div class="search-box">
            <label>Volunteer:</label>
            <Select v-model="volunteerChoice" :options="volunteerOptions" placeholder="All volunteers" show-clear />
          </div>
          <div class="search-box">
            <label>Service:</label>
            <Select v-model="serviceChoice" :options="serviceOptions" placeholder="All services" show-clear />
          </div>
          <div class="search-box">
            <label>Notifications:</label>
            <Select v-model="notificationFilter" :options="['Not notified']" placeholder="All requests" show-clear />
          </div>
          <div class="search-box request-num-box">
            <label>Request #:</label>
            <IconField>
              <InputText v-model="idSearch" placeholder="Search by #" />
              <InputIcon v-if="idSearch" class="pi pi-times" style="cursor: pointer" @click="idSearch = ''" />
            </IconField>
          </div>
        </div>
      </div>
    </div>

    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="active">Active</Tab>
        <Tab value="historic">Historic</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="active">
          <ServiceRequestTable v-bind="tableProps" @row-click="onRowClick">
            <template #actions="{ data }">
              <span class="bell-wrapper">
                <Button icon="pi pi-bell" v-tooltip="'Show Notifications'" class="p-button-rounded p-button-text p-button-sm" aria-label="Notification history" @click.stop="openHistory(data)" />
                <span v-if="data.notifications?.length === 0 && !data.requestNumber" class="bell-alert-icon" aria-hidden="true"></span>
              </span>
              <Button v-if="canWriteSr" icon="pi pi-pencil" v-tooltip="'Edit Request'" class="p-button-rounded p-button-text p-button-sm" @click.stop="navigateToEditRequest(data.serviceRequestId)" />
            </template>
          </ServiceRequestTable>
        </TabPanel>
        <TabPanel value="historic">
          <div class="historic-range">
            <label for="historic-start">From</label>
            <input id="historic-start" v-model="historicStart" type="date" >
            <label for="historic-end">To</label>
            <input id="historic-end" v-model="historicEnd" type="date" >
            <small>Leave “To” empty for no upper bound.</small>
          </div>
          <ServiceRequestTable v-bind="tableProps" @row-click="onRowClick">
            <template #actions="{ data }">
              <span class="bell-wrapper">
                <Button icon="pi pi-bell" v-tooltip="'Show Notifications'" class="p-button-rounded p-button-text p-button-sm" aria-label="Notification history" @click.stop="openHistory(data)" />
                <span v-if="data.notifications?.length === 0 && !data.requestNumber" class="bell-alert-icon" aria-hidden="true"></span>
              </span>
              <Button v-if="canWriteSr" icon="pi pi-pencil" v-tooltip="'Edit Request'" class="p-button-rounded p-button-text p-button-sm" @click.stop="navigateToEditRequest(data.serviceRequestId)" />
            </template>
          </ServiceRequestTable>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <NotificationHistoryDialog
      v-model:visible="historyDialogVisible"
      :service-request-id="historyRequestId"
      :display-label="historyRequestLabel"
      :allow-send-button="canWriteSr"
      :status="historyRequestStatus"
      @notified="onNotified"
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
.filters-container { display: flex; flex-direction: column; gap: 0.75rem; }
.filters-header { display: flex; align-items: center; gap: 0.75rem; }
/* Bolder label matches the "Use member's home" treatment: outlined + 700 label
   reads as prominent without competing with the solid primary actions. */
.filters-btn-label { font-weight: 700; }
.filters-chevron { font-size: 0.75rem; transition: transform 0.2s ease; }
.filters-chevron.collapsed { transform: rotate(-90deg); }
.filter-count-tag { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.75rem; background-color: var(--color-background-subtle); border: 1px solid var(--color-border-default); border-radius: 12px; font-size: 0.875rem; color: var(--color-text-primary); font-weight: 500; white-space: nowrap; }
.clear-filters-icon { display: inline-flex; align-items: center; justify-content: center; margin-left: 0.5rem; cursor: pointer; color: var(--color-text-dim); font-size: 0.75rem; font-weight: bold; line-height: 1; transition: color 0.2s ease; }
.clear-filters-icon:hover { color: var(--color-text-primary); }
.filters-content { display: flex; gap: 0.75rem 1.25rem; flex-wrap: wrap; align-items: flex-start; padding: 1rem; background-color: var(--color-background-light); border: 1px solid var(--color-border-default); border-radius: 4px; }
.status-filter-group { display: flex; flex-direction: column; gap: 0.5rem; flex: 1 1 100%; }
.filter-group-label { font-weight: 500; color: var(--color-text-primary); font-size: 0.9rem; }
.filters-content .search-box { display: flex; flex-direction: column; gap: 0.5rem; min-width: 160px; }
/* Size the IconField wrapper, not the inner input, so the clear icon stays
   anchored to the input's right edge. */
.filters-content .request-num-box { min-width: 0; }
.request-num-box :deep(.p-iconfield) { width: 10rem; }
.request-num-box :deep(input) { width: 100%; }
.filters-content .search-box label { font-weight: 500; color: var(--color-text-primary); font-size: 0.9rem; }
.status-filters { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.status-filter { display: flex; align-items: center; gap: 0.375rem; }
@media (max-width: 768px) {
  .service-request-list { padding: 1rem; }
}
.historic-range { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
.historic-range label { color: var(--color-text-secondary, inherit); font-size: 0.9rem; }
.historic-range input[type="date"] { padding: 0.4rem 0.5rem; border: 1px solid var(--p-inputtext-border-color, #ccc); border-radius: 4px; background: var(--p-inputtext-background, transparent); color: inherit; }
.historic-range small { color: var(--color-text-secondary, #777); }
.bell-wrapper { position: relative; display: inline-flex; }
.bell-alert-icon { position: absolute; top: 6px; right: 6px; width: 7px; height: 7px; background: #ff9800; color: #fff; border-radius: 50%; font-size: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center; pointer-events: none; line-height: 1; }
</style>
