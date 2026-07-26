<script setup>
import { computed, ref, watch, onMounted, onActivated, onDeactivated } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import AutoComplete from 'primevue/autocomplete'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import NotificationHistoryDialog from './NotificationHistoryDialog.vue'
import ServiceRequestTable from './ServiceRequestTable.vue'
import { useToast } from 'primevue/usetoast'
import ExportButton from '../../../components/ExportButton.vue'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getVillageServiceRequests } from '../api/serviceRequestApi.js'
import { useServiceRequestFilters } from '../composables/useServiceRequestFilters.js'
import { useServiceRequestTabs } from '../composables/useServiceRequestTabs.js'
import { apiCall } from '../../../shared/api/apiClient.js'
import { toCsv, downloadCsv, withLocalDateTimeColumns } from '../../../shared/lib/csvUtils.js'
import { setPendingHighlight, consumePendingHighlight } from '../../../shared/lib/pendingHighlight.js'
import { createSheet } from '../../../shared/services/googleSheetsService.js'
defineOptions({ name: 'VillageServiceRequestList' })

const router = useRouter()
const route = useRoute()

let toast = null
onMounted(() => { toast = useToast() })

useScrollRestore('service-requests', 'service-request-detail')

const villageId = computed(() => route.params.villageId)

const isCreatingSheet = ref(false)
// The AutoComplete inputs bind to their own refs and only *apply* a filter on
// item-select, so typing a partial name does not blank the table. These mirror
// into the composable's selectedMember/selectedVolunteer.
const memberInput = ref('')
const volunteerInput = ref('')
const memberSuggestions = ref([])
const volunteerSuggestions = ref([])
const historyDialogVisible = ref(false)
const historyRequestId = ref(null)
const historyRequestLabel = ref(null)
const openHistory = (row) => {
  historyRequestId.value = row.serviceRequestId
  historyRequestLabel.value = row.displayNumber
  historyDialogVisible.value = true
}

const tabs = useServiceRequestTabs({
  fetcher: (params) => getVillageServiceRequests(villageId.value, params)
})
const {
  activeTab, historicStart, historicEnd, statusOptions,
  currentRows: requests, isLoading, error, fetchCurrent
} = tabs

const {
  selectedMember, selectedVolunteer, selectedService, idSearch, selectedStatuses,
  memberNames, volunteerNames, serviceNames,
  filteredRows: filteredRequests, clearAll
} = useServiceRequestFilters(requests)

// Each tab offers its own status set, so a selection made on one tab would
// match nothing on the other. Reset it when the tab changes.
watch(activeTab, () => { selectedStatuses.value = [] })

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

const { state: village, execute: fetchVillage } = useAsyncState(
  () => villageId.value ? apiCall('getVillage', { villageId: villageId.value }) : null,
  { immediate: false }
)

const hasActivatedOnce = ref(false)
const villageIdAtDeactivation = ref(null)
const flashRowId = ref(null)
const flashTimer = ref(null)

// Refetch the visible tab when it is first shown, or when the historic window moves.
watch(activeTab, () => { if (requests.value === null) fetchCurrent() })
watch([historicStart, historicEnd], () => {
  if (activeTab.value === 'historic') fetchCurrent()
})

onMounted(() => { if (villageId.value) tabs.fetchActive() })

const { pause: pauseVillageWatch, resume: resumeVillageWatch } = watch(() => route.params.villageId, () => {
  clearAll()
  memberInput.value = ''
  volunteerInput.value = ''
  activeTab.value = 'active'
  tabs.activeRows.value = null
  tabs.historicRows.value = null
  tabs.fetchActive()
  village.value = null
})

onDeactivated(() => {
  pauseVillageWatch()
  villageIdAtDeactivation.value = villageId.value
})

onActivated(async () => {
  resumeVillageWatch()
  if (!hasActivatedOnce.value) {
    hasActivatedOnce.value = true
    return
  }
  const villageChanged = villageId.value !== villageIdAtDeactivation.value
  if (villageChanged) {
    consumePendingHighlight()
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

const hasLoadedOnce = ref(false)
watch(requests, (val) => { if (val !== null) hasLoadedOnce.value = true })

const filterMemberSuggestions = (event) => {
  const q = event.query.toLowerCase()
  memberSuggestions.value = memberNames.value.filter(n => n.toLowerCase().includes(q))
}

const filterVolunteerSuggestions = (event) => {
  const q = event.query.toLowerCase()
  volunteerSuggestions.value = volunteerNames.value.filter(n => n.toLowerCase().includes(q))
}

// Apply on select only; clearing the input clears the applied filter.
const onMemberSelect = (event) => { selectedMember.value = event.value }
const onVolunteerSelect = (event) => { selectedVolunteer.value = event.value }

watch(memberInput, (val) => { if (!val) selectedMember.value = '' })
watch(volunteerInput, (val) => { if (!val) selectedVolunteer.value = '' })

const serviceOptions = computed(() => ['All services', ...serviceNames.value])
// The Select shows an 'All services' sentinel; the composable uses '' for
// "no filter". Bridge the two so neither has to know about the other.
const serviceChoice = computed({
  get: () => selectedService.value || 'All services',
  set: (val) => { selectedService.value = val === 'All services' ? '' : val }
})

const activeFilterCount = computed(() => {
  let count = 0
  if (selectedMember.value) count++
  if (selectedVolunteer.value) count++
  if (selectedService.value) count++
  if (idSearch.value.trim()) count++
  if (selectedStatuses.value.length) count++
  return count
})

const columnsForCsv = [
  { header: 'Request #', key: 'displayNumber' },
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
  if (!village.value && villageId.value) await fetchVillage()
  const csv = toCsv(withLocalDateTimeColumns(filteredRequests.value, DATE_TIME_CSV_KEYS), columnsForCsv)
  const villageName = village.value?.name || 'village'
  downloadCsv(csv, `${villageName}-service-requests.csv`)
}

async function handleCreateSheet() {
  try {
    isCreatingSheet.value = true
    if (!village.value && villageId.value) await fetchVillage()
    const villageName = village.value?.name || 'Village Green'
    const result = await createSheet(withLocalDateTimeColumns(filteredRequests.value, DATE_TIME_CSV_KEYS), columnsForCsv, `${villageName} Service Requests`)
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

// Both tab panels render the same table; bind one prop object so they cannot drift.
const tableProps = computed(() => ({
  rows: filteredRequests.value,
  isLoading: isLoading.value,
  hasLoadedOnce: hasLoadedOnce.value,
  error: error.value,
  flashRowId: flashRowId.value
}))

const onRowClick = (event) => navigateToRequest(event.data.serviceRequestId, event.data.villageId)

const navigateToRequest = (serviceRequestId, rowVillageId) => {
  setPendingHighlight(serviceRequestId)
  router.push({ name: 'service-request-detail', params: { villageId: rowVillageId ?? villageId.value, id: serviceRequestId } })
}

const clearFilters = () => {
  clearAll()
  memberInput.value = ''
  volunteerInput.value = ''
}
</script>

<template>
  <div class="service-request-list">
    <div class="header-row">
      <div class="title-group">
        <h1>Service Requests</h1>
      </div>
    </div>

    <div class="filter-row">
      <AutoComplete v-model="memberInput" :suggestions="memberSuggestions" placeholder="Member" show-clear force-selection fluid @complete="filterMemberSuggestions" @item-select="onMemberSelect" />
      <AutoComplete v-model="volunteerInput" :suggestions="volunteerSuggestions" placeholder="Volunteer" show-clear force-selection fluid @complete="filterVolunteerSuggestions" @item-select="onVolunteerSelect" />
      <Select v-model="serviceChoice" :options="serviceOptions" placeholder="Service" />
      <MultiSelect
        v-model="selectedStatuses"
        :options="statusOptions"
        :option-label="s => s.charAt(0).toUpperCase() + s.slice(1)"
        placeholder="Status"
        :max-selected-labels="5"
        selected-items-label="{0} statuses"
        show-clear
      />
      <InputText v-model="idSearch" placeholder="Request #" />
      <Button v-if="activeFilterCount > 0" icon="pi pi-times" text rounded v-tooltip="'Clear filters'" @click="clearFilters" />
    </div>

    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="active">Active</Tab>
        <Tab value="historic">Historic</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="active">
          <ServiceRequestTable v-bind="tableProps" @row-click="onRowClick">
            <template #paginator-extra><ExportButton :disabled="isLoading || isCreatingSheet" @download="handleDownloadCsv" @export="handleCreateSheet" /></template>
            <template #actions="{ data }">
              <span class="bell-wrapper">
                <Button icon="pi pi-bell" v-tooltip="'Show Notifications'" class="p-button-rounded p-button-text p-button-sm" aria-label="Notification history" @click.stop="openHistory(data)" />
                <span v-if="data.requestNumber == null && !data.notifications?.length" class="bell-alert-icon" aria-hidden="true"></span>
              </span>
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
            <template #paginator-extra><ExportButton :disabled="isLoading || isCreatingSheet" @download="handleDownloadCsv" @export="handleCreateSheet" /></template>
            <template #actions="{ data }">
              <span class="bell-wrapper">
                <Button icon="pi pi-bell" v-tooltip="'Show Notifications'" class="p-button-rounded p-button-text p-button-sm" aria-label="Notification history" @click.stop="openHistory(data)" />
                <span v-if="data.requestNumber == null && !data.notifications?.length" class="bell-alert-icon" aria-hidden="true"></span>
              </span>
            </template>
          </ServiceRequestTable>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <NotificationHistoryDialog
      v-model:visible="historyDialogVisible"
      :service-request-id="historyRequestId"
      :display-label="historyRequestLabel"
      @notified="onNotified"
    />
  </div>
</template>

<style scoped>
.service-request-list { padding: 2rem; }
.header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
.title-group { display: flex; flex-direction: column; gap: 0.25rem; }
h1 { margin: 0; color: var(--color-text-primary); }
.filter-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 2rem; }
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
