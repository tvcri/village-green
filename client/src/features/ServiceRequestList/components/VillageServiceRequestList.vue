<script setup>
import { computed, ref, watch, onMounted, onActivated, onDeactivated } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import AutoComplete from 'primevue/autocomplete'
import Button from 'primevue/button'
import NotificationHistoryDialog from './NotificationHistoryDialog.vue'
import ServiceRequestTable from './ServiceRequestTable.vue'
import { useToast } from 'primevue/usetoast'
import ExportButton from '../../../components/ExportButton.vue'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getVillageServiceRequests } from '../api/serviceRequestApi.js'
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
const selectedMember = ref('')
const selectedVolunteer = ref('')
const appliedMember = ref('')
const appliedVolunteer = ref('')
const memberSuggestions = ref([])
const volunteerSuggestions = ref([])
const selectedService = ref('All services')
const historyDialogVisible = ref(false)
const historyRequestId = ref(null)
const historyRequestLabel = ref(null)
const openHistory = (row) => {
  historyRequestId.value = row.serviceRequestId
  historyRequestLabel.value = row.displayNumber
  historyDialogVisible.value = true
}

const onNotified = (updated) => {
  requests.value = requests.value.map(r =>
    r.serviceRequestId === updated.serviceRequestId
      ? { ...r, notifications: updated.notificationHistory?.map(e => e.eventType) ?? [] }
      : r
  )
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
const flashRowId = ref(null)
const flashTimer = ref(null)

const { pause: pauseVillageWatch, resume: resumeVillageWatch } = watch(() => route.params.villageId, () => {
  selectedMember.value = ''
  selectedVolunteer.value = ''
  appliedMember.value = ''
  appliedVolunteer.value = ''
  selectedService.value = 'All services'
  selectedStatuses.value = ['open', 'confirmed']
  fetchRequests()
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
  await fetchRequests()
  const id = consumePendingHighlight()
  if (id) {
    flashRowId.value = id
    clearTimeout(flashTimer.value)
    flashTimer.value = setTimeout(() => { flashRowId.value = null }, 2000)
  }
})

const hasLoadedOnce = ref(false)
watch(requests, (val) => { if (val !== null) hasLoadedOnce.value = true })

const statusOptions = ['open', 'confirmed', 'completed', 'unmatched', 'cancelled']

const memberNames = computed(() => {
  if (!Array.isArray(requests.value)) return []
  return Array.from(new Set(requests.value.map(r => r.memberFullName).filter(Boolean))).sort()
})

const volunteerNames = computed(() => {
  if (!Array.isArray(requests.value)) return []
  return Array.from(new Set(requests.value.map(r => r.volunteerFullName).filter(Boolean))).sort()
})

const filterMemberSuggestions = (event) => {
  const q = event.query.toLowerCase()
  memberSuggestions.value = memberNames.value.filter(n => n.toLowerCase().includes(q))
}

const filterVolunteerSuggestions = (event) => {
  const q = event.query.toLowerCase()
  volunteerSuggestions.value = volunteerNames.value.filter(n => n.toLowerCase().includes(q))
}

const onMemberSelect = (event) => { appliedMember.value = event.value }
const onVolunteerSelect = (event) => { appliedVolunteer.value = event.value }

watch(selectedMember, (val) => { if (!val) appliedMember.value = '' })
watch(selectedVolunteer, (val) => { if (!val) appliedVolunteer.value = '' })

const serviceOptions = computed(() => {
  if (!Array.isArray(requests.value)) return []
  const seen = new Map()
  for (const r of requests.value) {
    if (r.serviceName) {
      const key = r.serviceName.toLowerCase().replace(/:\s*/g, ': ').trim()
      if (!seen.has(key)) seen.set(key, r.serviceName)
    }
  }
  return ['All services', ...Array.from(seen.values()).sort()]
})

const filteredRequests = computed(() => {
  if (!Array.isArray(requests.value)) return []
  return requests.value.filter(r => {
    let memberMatch = true
    if (appliedMember.value) {
      memberMatch = r.memberFullName === appliedMember.value
    }
    let volunteerMatch = true
    if (appliedVolunteer.value) {
      volunteerMatch = r.volunteerFullName === appliedVolunteer.value
    }
    let serviceMatch = true
    if (selectedService.value && selectedService.value !== 'All services') {
      const normalize = s => s?.toLowerCase().replace(/:\s*/g, ': ').trim()
      serviceMatch = normalize(r.serviceName) === normalize(selectedService.value)
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
    return memberMatch && volunteerMatch && serviceMatch && statusMatch
  })
})

const activeFilterCount = computed(() => {
  let count = 0
  if (appliedMember.value) count++
  if (appliedVolunteer.value) count++
  if (selectedService.value && selectedService.value !== 'All services') count++
  return count
})

const columnsForCsv = [
  { header: 'Request #', key: 'displayNumber' },
  { header: 'Status', key: 'status' },
  { header: 'Service', key: 'serviceName' },
  { header: 'Member', key: 'memberFullName' },
  { header: 'Volunteer', key: 'volunteerFullName' },
  { header: 'Description', key: 'description' },
  { header: 'Start At', key: 'startAt' },
  { header: 'Arrive At', key: 'apptTime' },
  { header: 'Return At', key: 'returnTime' },
  { header: 'Finish At', key: 'finishAt' },
  { header: 'Destination', key: 'destination' },
  { header: 'Address', key: 'address' },
  { header: 'City', key: 'city' },
  { header: 'State', key: 'state' },
  { header: 'Created At', key: 'createdAt' }
]
  
const DATE_TIME_CSV_KEYS = ['startAt', 'apptTime', 'returnTime', 'finishAt', 'createdAt']

const handleDownloadCsv = async () => {
  if (!village.value && villageId.value) await fetchVillage()
  const csv = toCsv(withLocalDateTimeColumns(requests.value || [], DATE_TIME_CSV_KEYS), columnsForCsv)
  const villageName = village.value?.name || 'village'
  downloadCsv(csv, `${villageName}-service-requests.csv`)
}

async function handleCreateSheet() {
  try {
    isCreatingSheet.value = true
    if (!village.value && villageId.value) await fetchVillage()
    const villageName = village.value?.name || 'Village Green'
    const result = await createSheet(withLocalDateTimeColumns(requests.value || [], DATE_TIME_CSV_KEYS), columnsForCsv, `${villageName} Service Requests`)
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
  router.push({ name: 'service-request-detail', params: { villageId: rowVillageId ?? villageId.value, id: serviceRequestId } })
}

const clearFilters = () => {
  selectedMember.value = ''
  selectedVolunteer.value = ''
  appliedMember.value = ''
  appliedVolunteer.value = ''
  selectedService.value = 'All services'
  selectedStatuses.value = []
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
      <AutoComplete v-model="selectedMember" :suggestions="memberSuggestions" placeholder="Member" show-clear force-selection fluid @complete="filterMemberSuggestions" @item-select="onMemberSelect" />
      <AutoComplete v-model="selectedVolunteer" :suggestions="volunteerSuggestions" placeholder="Volunteer" show-clear force-selection fluid @complete="filterVolunteerSuggestions" @item-select="onVolunteerSelect" />
      <Select v-model="selectedService" :options="serviceOptions" placeholder="Service" />
      <MultiSelect v-model="selectedStatuses" :options="statusOptions" :option-label="s => s.charAt(0).toUpperCase() + s.slice(1)" placeholder="Status" :max-selected-labels="5" selected-items-label="{0} statuses" showClear/>
      <Button v-if="activeFilterCount > 0" icon="pi pi-times" text rounded v-tooltip="'Clear filters'" @click="clearFilters" />
    </div>

    <ServiceRequestTable
      :rows="filteredRequests"
      :is-loading="isLoading"
      :has-loaded-once="hasLoadedOnce"
      :error="error"
      :flash-row-id="flashRowId"
      @row-click="(event) => navigateToRequest(event.data.serviceRequestId, event.data.villageId)"
    >
      <template #paginator-extra>
        <ExportButton
          :disabled="isLoading || isCreatingSheet"
          @download="handleDownloadCsv"
          @export="handleCreateSheet"
        />
      </template>
      <template #actions="{ data }">
        <span class="bell-wrapper">
          <Button
            icon="pi pi-bell"
            v-tooltip="'Show Notifications'"
            class="p-button-rounded p-button-text p-button-sm"
            aria-label="Notification history"
            @click.stop="openHistory(data)"
          />
          <span v-if="data.requestNumber == null && !data.notifications?.length" class="bell-alert-icon" aria-hidden="true"></span>
        </span>
      </template>
    </ServiceRequestTable>

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
.bell-wrapper { position: relative; display: inline-flex; }
.bell-alert-icon { position: absolute; top: 6px; right: 6px; width: 7px; height: 7px; background: #ff9800; color: #fff; border-radius: 50%; font-size: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center; pointer-events: none; line-height: 1; }
</style>
