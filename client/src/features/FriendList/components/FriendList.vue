<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Popover from 'primevue/popover'
import { getFriends } from '../api/friendApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'

defineOptions({ name: 'FriendList' })

const route = useRoute()

const isMetaMode = computed(() => !route.params.villageId)

useScrollRestore(
  isMetaMode.value ? 'meta-friends' : 'friends',
  null
)

const selectedVillage = ref(null)
const volunteerName = ref('')
const memberName = ref('')
const dateStart = ref(null)
const dateEnd = ref(null)
const selectedContactType = ref(null)
const selectedActivityType = ref(null)
const filtersCollapsed = ref(true)

const contactTypeOptions = ['In-Person', 'Phone', 'Virtual']
const activityTypeOptions = [
  'companionship', 'activity', 'assistance', 'outdoors',
  'outing', 'dining', 'wellness', 'pet', 'other'
]

const hasFilter = computed(() =>
  selectedVillage.value ||
  volunteerName.value.trim() ||
  memberName.value.trim() ||
  dateStart.value ||
  dateEnd.value ||
  selectedContactType.value ||
  selectedActivityType.value
)

const { state: friends, isLoading, execute: fetchFriends } = useAsyncState(
  () => getFriends({
    villageId: selectedVillage.value?.villageId ?? null,
    volunteerName: volunteerName.value.trim() || undefined,
    memberName: memberName.value.trim() || undefined,
    dateStart: dateStart.value ? formatDateParam(dateStart.value) : undefined,
    dateEnd: dateEnd.value ? formatDateParam(dateEnd.value) : undefined,
    contactType: selectedContactType.value || undefined,
    activityType: selectedActivityType.value || undefined,
  }),
  { immediate: false }
)

const { state: allVillages } = useAsyncState(
  () => isMetaMode.value ? getVillages() : null,
  { immediate: true }
)

watch(hasFilter, (val) => {
  if (!val) friends.value = null
})

function formatDateParam(date) {
  const d = new Date(date)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function onSearch() {
  if (hasFilter.value) fetchFriends()
}

function onClear() {
  selectedVillage.value = null
  volunteerName.value = ''
  memberName.value = ''
  dateStart.value = null
  dateEnd.value = null
  selectedContactType.value = null
  selectedActivityType.value = null
  friends.value = null
}

function getContactTypeSeverity(type) {
  if (type === 'In-Person') return 'success'
  if (type === 'Phone') return 'info'
  return 'secondary'
}

function personName(person) {
  if (!person) return '—'
  return person.personId ? person.fullName : (person.rawName || '—')
}

function isUnresolved(person) {
  return person && !person.personId
}

const popoverRefs = ref({})
function registerPopover(el, friendId) {
  if (el) popoverRefs.value[friendId] = el
}
function toggleNotes(event, friendId) {
  popoverRefs.value[friendId]?.toggle(event)
}
</script>

<template>
  <div class="friend-list">
    <div class="list-header">
      <h2>Friends</h2>
      <span v-if="friends !== null && !isLoading" class="result-count">
        {{ friends.length }} {{ friends.length === 1 ? 'record' : 'records' }}
      </span>
    </div>

    <div class="filter-bar">
      <button class="filters-toggle" @click="filtersCollapsed = !filtersCollapsed">
        Filters <span :class="['pi', filtersCollapsed ? 'pi-chevron-down' : 'pi-chevron-up']" />
      </button>
    </div>

    <div v-if="!filtersCollapsed" class="filter-panel">
      <div class="filter-row">
        <Select
          v-if="isMetaMode"
          v-model="selectedVillage"
          :options="allVillages ?? []"
          optionLabel="name"
          placeholder="All villages"
          showClear
          class="filter-control"
        />
        <InputText
          v-model="volunteerName"
          placeholder="Volunteer name"
          class="filter-control"
          @keyup.enter="onSearch"
        />
        <InputText
          v-model="memberName"
          placeholder="Member name"
          class="filter-control"
          @keyup.enter="onSearch"
        />
        <DatePicker
          v-model="dateStart"
          placeholder="Date from"
          dateFormat="yy-mm-dd"
          showButtonBar
          class="filter-control"
        />
        <DatePicker
          v-model="dateEnd"
          placeholder="Date to"
          dateFormat="yy-mm-dd"
          showButtonBar
          class="filter-control"
        />
        <Select
          v-model="selectedContactType"
          :options="contactTypeOptions"
          placeholder="Contact type"
          showClear
          class="filter-control"
        />
        <Select
          v-model="selectedActivityType"
          :options="activityTypeOptions"
          placeholder="Activity type"
          showClear
          class="filter-control"
        />
      </div>
      <div class="filter-actions">
        <Button label="Search" icon="pi pi-search" :disabled="!hasFilter" @click="onSearch" />
        <Button label="Clear" icon="pi pi-times" severity="secondary" :disabled="!hasFilter" @click="onClear" />
      </div>
    </div>

    <div v-if="friends === null && !isLoading" class="empty-prompt">
      Enter at least one filter to search for Friends records.
    </div>

    <div v-if="isLoading" class="loading-prompt">
      Loading…
    </div>

    <DataTable
      v-if="friends !== null && !isLoading"
      :value="friends"
      class="friend-table"
      stripedRows
    >
      <Column field="visitDate" header="Visit Date" sortable style="width: 10%" />

      <Column v-if="isMetaMode" header="Village" style="width: 12%">
        <template #body="{ data }">
          {{ data.village?.name ?? '—' }}
        </template>
      </Column>

      <Column header="Volunteer" style="width: 14%">
        <template #body="{ data }">
          <span class="person-cell">
            {{ personName(data.volunteer) }}
            <i
              v-if="isUnresolved(data.volunteer)"
              class="pi pi-exclamation-triangle unresolved-icon"
              v-tooltip="'Name not matched to a person record'"
            />
          </span>
        </template>
      </Column>

      <Column header="Member" style="width: 14%">
        <template #body="{ data }">
          <span class="person-cell">
            {{ personName(data.member) }}
            <i
              v-if="isUnresolved(data.member)"
              class="pi pi-exclamation-triangle unresolved-icon"
              v-tooltip="'Name not matched to a person record'"
            />
          </span>
        </template>
      </Column>

      <Column header="Contact Type" style="width: 11%">
        <template #body="{ data }">
          <Tag
            v-if="data.contactType"
            :value="data.contactType"
            :severity="getContactTypeSeverity(data.contactType)"
          />
        </template>
      </Column>

      <Column header="Activities" style="width: 18%">
        <template #body="{ data }">
          <div class="activity-tags">
            <Tag
              v-for="activity in (data.activityTypes ?? [])"
              :key="activity"
              :value="activity"
              severity="secondary"
            />
          </div>
        </template>
      </Column>

      <Column field="timeSpentMinutes" header="Time" sortable style="width: 7%">
        <template #body="{ data }">
          {{ data.timeSpentMinutes }} min
        </template>
      </Column>

      <Column header="Notes" style="width: 6%">
        <template #body="{ data }">
          <template v-if="data.notes">
            <i
              class="pi pi-file-edit notes-icon"
              style="cursor: pointer"
              @click="toggleNotes($event, data.friendId)"
            />
            <Popover :ref="el => registerPopover(el, data.friendId)">
              <div class="notes-popover">{{ data.notes }}</div>
            </Popover>
          </template>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.friend-list {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.list-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.list-header h2 {
  margin: 0;
}

.result-count {
  color: var(--color-text-secondary, #666);
  font-size: 0.9rem;
}

.filter-bar {
  display: flex;
  align-items: center;
}

.filters-toggle {
  background: none;
  border: 1px solid var(--p-surface-300, #ccc);
  border-radius: 4px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
}

.filter-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--p-surface-200, #e5e5e5);
  border-radius: 6px;
  background: var(--p-surface-50, #fafafa);
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-control {
  min-width: 160px;
}

.filter-actions {
  display: flex;
  gap: 0.5rem;
}

.empty-prompt,
.loading-prompt {
  color: var(--color-text-secondary, #666);
  font-style: italic;
  padding: 2rem 0;
}

.activity-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.person-cell {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.unresolved-icon {
  color: var(--p-orange-500, #f59e0b);
  font-size: 0.85rem;
}

.notes-icon {
  font-size: 1rem;
  color: var(--p-primary-color, #6366f1);
}

.notes-popover {
  max-width: 320px;
  white-space: pre-wrap;
  font-size: 0.9rem;
  line-height: 1.5;
}
</style>
