<script setup>
import { ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getHttpStatus, isPrivacyAckError } from '../../../shared/api/apiClient.js'
import { getVolunteerRequests, pickupVolunteerRequest, releaseVolunteerRequest } from '../api/volunteerRequestApi.js'

const toast = useToast()
const confirm = useConfirm()
const activeTab = ref('open')

const { state: openRequests, isLoading: openLoading, execute: fetchOpen } = useAsyncState(
  () => getVolunteerRequests('open'),
  { immediate: true, initialState: [] }
)

const { state: myRequests, isLoading: mineLoading, execute: fetchMine } = useAsyncState(
  () => getVolunteerRequests('mine'),
  { immediate: true, initialState: [] }
)

function refreshBoth() {
  fetchOpen()
  fetchMine()
}

function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function memberLabel(row) {
  if (!row.member) return ''
  const place = [row.member.city, row.member.state].filter(Boolean).join(', ')
  return place ? `${row.member.fullName} (${place})` : row.member.fullName
}

function confirmPickup(row) {
  confirm.require({
    header: 'Pick up this request?',
    message: `You will be confirmed as the provider for "${row.serviceName || 'this request'}"${row.member?.fullName ? ` for ${row.member.fullName}` : ''}.`,
    icon: 'pi pi-heart',
    acceptLabel: 'Pick up',
    rejectLabel: 'Cancel',
    accept: () => doPickup(row),
  })
}

async function doPickup(row) {
  try {
    await pickupVolunteerRequest(row.serviceRequestId)
    toast.add({ severity: 'success', summary: 'Confirmed', detail: 'You are confirmed for this request. Watch your email for details.', life: 5000 })
  }
  catch (err) {
    if (isPrivacyAckError(err)) return
    if (getHttpStatus(err) === 409) {
      toast.add({ severity: 'warn', summary: 'No longer available', detail: 'Another volunteer picked this request up first.', life: 5000 })
    }
    else {
      toast.add({ severity: 'error', summary: 'Pickup failed', detail: 'Please try again or contact the hub.', life: 5000 })
    }
  }
  finally {
    refreshBoth()
  }
}

function confirmRelease(row) {
  confirm.require({
    header: 'Release this commitment?',
    message: 'The request will reopen for other volunteers. The hub will see it as unassigned.',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Release',
    rejectLabel: 'Keep it',
    acceptClass: 'p-button-danger',
    accept: () => doRelease(row),
  })
}

async function doRelease(row) {
  try {
    await releaseVolunteerRequest(row.serviceRequestId)
    toast.add({ severity: 'info', summary: 'Released', detail: 'The request has been reopened.', life: 5000 })
  }
  catch (err) {
    if (isPrivacyAckError(err)) return
    toast.add({ severity: 'error', summary: 'Release failed', detail: 'Please try again or contact the hub.', life: 5000 })
  }
  finally {
    refreshBoth()
  }
}
</script>

<template>
  <div class="volunteer-home">
    <h2>Volunteer</h2>
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="open">Available requests</Tab>
        <Tab value="mine">My commitments</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="open">
          <DataTable :value="openRequests" :loading="openLoading" dataKey="serviceRequestId" stripedRows>
            <template #empty>No open requests right now. Thanks for checking!</template>
            <Column field="serviceName" header="Service" sortable />
            <Column header="Member">
              <template #body="{ data }">{{ memberLabel(data) }}</template>
            </Column>
            <Column field="startAt" header="When" sortable>
              <template #body="{ data }">{{ formatDateTime(data.startAt) }}</template>
            </Column>
            <Column field="description" header="Description" />
            <Column field="destination" header="Destination" />
            <Column>
              <template #body="{ data }">
                <Button label="Pick up" size="small" @click="confirmPickup(data)" />
              </template>
            </Column>
          </DataTable>
        </TabPanel>
        <TabPanel value="mine">
          <DataTable :value="myRequests" :loading="mineLoading" dataKey="serviceRequestId" stripedRows>
            <template #empty>You have no commitments yet.</template>
            <Column field="status" header="Status" sortable />
            <Column field="serviceName" header="Service" sortable />
            <Column header="Member">
              <template #body="{ data }">{{ memberLabel(data) }}</template>
            </Column>
            <Column field="startAt" header="When" sortable>
              <template #body="{ data }">{{ formatDateTime(data.startAt) }}</template>
            </Column>
            <Column header="Member contact">
              <template #body="{ data }">
                <div v-if="data.member && data.status === 'Confirmed'">
                  <div>{{ data.member.phone }}</div>
                  <div v-if="data.member.cell">{{ data.member.cell }} (cell)</div>
                  <div>{{ data.member.address }}</div>
                </div>
              </template>
            </Column>
            <Column>
              <template #body="{ data }">
                <Button
                  v-if="data.status === 'Confirmed'"
                  label="Release"
                  size="small"
                  severity="danger"
                  outlined
                  @click="confirmRelease(data)"
                />
              </template>
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
</style>
