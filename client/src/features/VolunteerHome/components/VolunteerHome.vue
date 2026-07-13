<script setup>
import { computed, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { formatServiceDate, timeStringToLabel } from '../../ServiceRequestList/lib/timeFields.js'
import { getVolunteerRequests, getVolunteerRequestVillages } from '../api/volunteerRequestApi.js'

const router = useRouter()
const activeTab = ref('open')
const openPageRows = ref(10)
const myPageRows = ref(10)
const historyPageRows = ref(10)

// 'open' is the default tab, fetched eagerly; 'mine'/'history' are fetched
// lazily the first time their tab is actually viewed, then cached for the
// rest of the component's lifetime (no refetch on switching back).
const { state: openRequests, isLoading: openLoading } = useAsyncState(
  () => getVolunteerRequests('open'),
  { immediate: true, initialState: [] }
)

const { state: myRequests, isLoading: mineLoading, execute: fetchMine } = useAsyncState(
  () => getVolunteerRequests('mine'),
  { immediate: false, initialState: [] }
)

const { state: historyRequests, isLoading: historyLoading, execute: fetchHistory } = useAsyncState(
  () => getVolunteerRequests('history'),
  { immediate: false, initialState: [] }
)

let mineFetched = false
let historyFetched = false

watchEffect(() => {
  if (activeTab.value === 'mine' && !mineFetched) {
    mineFetched = true
    fetchMine()
  }
  if (activeTab.value === 'history' && !historyFetched) {
    historyFetched = true
    fetchHistory()
  }
})

const { state: villageOptions } = useAsyncState(
  () => getVolunteerRequestVillages(),
  { immediate: true, initialState: [] }
)

// The village filter is rarely-changing (villages number ~13, added every
// couple months), so it's fetched once here rather than re-derived from
// whichever requests happen to be currently loaded — deriving it from
// openRequests would make a stored selection vanish whenever that village
// had zero open requests at the moment of load.
const VILLAGE_FILTER_KEY = 'vg.volunteerHome.villageFilter'
let storedVillageFilter = []
try {
  storedVillageFilter = JSON.parse(localStorage.getItem(VILLAGE_FILTER_KEY) ?? '[]')
}
catch {
  storedVillageFilter = []
}
const selectedVillageIds = ref(storedVillageFilter)

watch(selectedVillageIds, (value) => {
  localStorage.setItem(VILLAGE_FILTER_KEY, JSON.stringify(value))
})

const filteredOpenRequests = computed(() => {
  if (!selectedVillageIds.value.length) return openRequests.value
  return openRequests.value.filter(r => selectedVillageIds.value.includes(r.villageId))
})

// Wall-clock civil values: serviceDate ('YYYY-MM-DD') and startTime
// ('HH:MM:SS') are never instants — render them via timeFields helpers,
// never new Date(value) (which would timezone-shift them). timesFlexible
// means "no specific time was set".
function formatWhen(row) {
  const date = formatServiceDate(row.serviceDate)
  if (!date) return ''
  if (row.timesFlexible) return `${date} · Flexible`
  const time = timeStringToLabel(row.startTime)
  return time ? `${date} · ${time}` : date
}

function memberLabel(row) {
  return row.member?.fullName ?? ''
}

function goToDetail(row) {
  router.push({ name: 'volunteer-request-detail', params: { id: row.serviceRequestId } })
}
</script>

<template>
  <div class="volunteer-home">
    <h2>Volunteer Self Signup</h2>
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="open">Available requests</Tab>
        <Tab value="mine">My commitments</Tab>
        <Tab value="history">My history</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="open">
          <div class="filter-row">
            <label class="filter-label" for="villageFilter">Village</label>
            <MultiSelect
              id="villageFilter"
              v-model="selectedVillageIds"
              :options="villageOptions"
              optionLabel="name"
              optionValue="villageId"
              display="chip"
              placeholder="All villages"
              class="village-filter"
            />
          </div>
          <DataTable
            :value="filteredOpenRequests"
            :loading="openLoading"
            dataKey="serviceRequestId"
            stripedRows
            paginator
            :rows="openPageRows"
            :pt="{ bodyRow: { style: { cursor: 'pointer' } } }"
            @row-click="(event) => goToDetail(event.data)"
          >
            <template #paginatorcontainer="{ first, last, page, pageCount, prevPageCallback, nextPageCallback, totalRecords }">
              <div class="paginator-container">
                <Button icon="pi pi-chevron-left" text rounded @click="prevPageCallback" :disabled="page === 0" />
                <span class="paginator-info">{{ first }}–{{ last }} of {{ totalRecords }}</span>
                <Button icon="pi pi-chevron-right" text rounded @click="nextPageCallback" :disabled="page === pageCount - 1" />
                <Select v-model="openPageRows" :options="[10, 25, 50, 100]" />
              </div>
            </template>
            <template #empty>No open requests right now. Thanks for checking!</template>
            <Column field="villageName" header="Village" sortable />
            <Column field="serviceName" header="Service" sortable />
            <Column header="Member">
              <template #body="{ data }">{{ memberLabel(data) }}</template>
            </Column>
            <Column field="serviceDate" header="When" sortable>
              <template #body="{ data }">{{ formatWhen(data) }}</template>
            </Column>
            <Column field="destination" header="Destination" />
          </DataTable>
        </TabPanel>
        <TabPanel value="mine">
          <DataTable
            :value="myRequests"
            :loading="mineLoading"
            dataKey="serviceRequestId"
            stripedRows
            paginator
            :rows="myPageRows"
            :pt="{ bodyRow: { style: { cursor: 'pointer' } } }"
            @row-click="(event) => goToDetail(event.data)"
          >
            <template #paginatorcontainer="{ first, last, page, pageCount, prevPageCallback, nextPageCallback, totalRecords }">
              <div class="paginator-container">
                <Button icon="pi pi-chevron-left" text rounded @click="prevPageCallback" :disabled="page === 0" />
                <span class="paginator-info">{{ first }}–{{ last }} of {{ totalRecords }}</span>
                <Button icon="pi pi-chevron-right" text rounded @click="nextPageCallback" :disabled="page === pageCount - 1" />
                <Select v-model="myPageRows" :options="[10, 25, 50, 100]" />
              </div>
            </template>
            <template #empty>You have no upcoming commitments.</template>
            <Column field="villageName" header="Village" sortable />
            <Column field="serviceName" header="Service" sortable />
            <Column header="Member">
              <template #body="{ data }">{{ memberLabel(data) }}</template>
            </Column>
            <Column field="serviceDate" header="When" sortable>
              <template #body="{ data }">{{ formatWhen(data) }}</template>
            </Column>
          </DataTable>
        </TabPanel>
        <TabPanel value="history">
          <DataTable
            :value="historyRequests"
            :loading="historyLoading"
            dataKey="serviceRequestId"
            stripedRows
            paginator
            :rows="historyPageRows"
            :pt="{ bodyRow: { style: { cursor: 'pointer' } } }"
            @row-click="(event) => goToDetail(event.data)"
          >
            <template #paginatorcontainer="{ first, last, page, pageCount, prevPageCallback, nextPageCallback, totalRecords }">
              <div class="paginator-container">
                <Button icon="pi pi-chevron-left" text rounded @click="prevPageCallback" :disabled="page === 0" />
                <span class="paginator-info">{{ first }}–{{ last }} of {{ totalRecords }}</span>
                <Button icon="pi pi-chevron-right" text rounded @click="nextPageCallback" :disabled="page === pageCount - 1" />
                <Select v-model="historyPageRows" :options="[10, 25, 50, 100]" />
              </div>
            </template>
            <template #empty>No completed requests yet.</template>
            <Column field="villageName" header="Village" sortable />
            <Column field="serviceName" header="Service" sortable />
            <Column header="Member">
              <template #body="{ data }">{{ memberLabel(data) }}</template>
            </Column>
            <Column field="serviceDate" header="When" sortable>
              <template #body="{ data }">{{ formatWhen(data) }}</template>
            </Column>
          </DataTable>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.volunteer-home {
  padding: 1rem;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.filter-label {
  font-weight: 600;
  color: var(--color-text-dim);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.village-filter {
  min-width: 16rem;
}
</style>
