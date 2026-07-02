<script setup>
import { computed, onActivated, onDeactivated, onMounted, ref, watch } from 'vue'
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

function thirtyDaysAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d
}

const selectedVillage = ref(null)
const volunteerName = ref('')
const memberName = ref('')
const dateStart = ref(isMetaMode.value ? null : thirtyDaysAgo())
const dateEnd = ref(null)
const selectedContactType = ref(null)
const selectedActivityType = ref(null)
const filtersCollapsed = ref(false)

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
    villageId: isMetaMode.value ? (selectedVillage.value?.villageId ?? null) : route.params.villageId,
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

const hasActivatedOnce = ref(false)
const villageIdAtDeactivation = ref(null)

const { pause: pauseVillageWatch, resume: resumeVillageWatch } = watch(
  () => route.params.villageId,
  () => {
    if (isMetaMode.value) return
    dateStart.value = thirtyDaysAgo()
    friends.value = null
    fetchFriends()
  }
)

onDeactivated(() => {
  pauseVillageWatch()
  villageIdAtDeactivation.value = route.params.villageId
})

onActivated(() => {
  resumeVillageWatch()
  if (!hasActivatedOnce.value) {
    hasActivatedOnce.value = true
    return
  }
  const villageChanged = route.params.villageId !== villageIdAtDeactivation.value
  if (villageChanged) return // watch will fire and handle the fetch
  if (!isMetaMode.value) fetchFriends()
})

onMounted(() => {
  if (!isMetaMode.value && hasFilter.value) fetchFriends()
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

const sortField = ref('visitDate')
const sortOrder = ref(-1)

const sortedFriends = computed(() => {
  if (!Array.isArray(friends.value)) return []
  return [...friends.value].sort((a, b) => {
    let aVal, bVal
    if (sortField.value === 'memberName') {
      aVal = personName(a.member)
      bVal = personName(b.member)
    } else if (sortField.value === 'volunteerName') {
      aVal = personName(a.volunteer)
      bVal = personName(b.volunteer)
    } else {
      aVal = a[sortField.value] ?? ''
      bVal = b[sortField.value] ?? ''
    }
    const cmp = String(aVal).localeCompare(String(bVal))
    return sortOrder.value === 1 ? cmp : -cmp
  })
})

function onSort(event) {
  sortField.value = event.sortField
  sortOrder.value = event.sortOrder
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
        <div v-if="isMetaMode" class="search-box">
          <label>Village:</label>
          <Select
            v-model="selectedVillage"
            :options="allVillages ?? []"
            optionLabel="name"
            placeholder="All villages"
            showClear
          />
        </div>
        <div class="search-box">
          <label>Member:</label>
          <InputText
            v-model="memberName"
            placeholder="Member name"
            @keyup.enter="onSearch"
          />
        </div>
        <div class="search-box">
          <label>Volunteer:</label>
          <InputText
            v-model="volunteerName"
            placeholder="Volunteer name"
            @keyup.enter="onSearch"
          />
        </div>
        <div class="search-box">
          <label>Date from:</label>
          <DatePicker
            v-model="dateStart"
            placeholder="Date from"
            dateFormat="yy-mm-dd"
            showButtonBar
          />
        </div>
        <div class="search-box">
          <label>Date to:</label>
          <DatePicker
            v-model="dateEnd"
            placeholder="Date to"
            dateFormat="yy-mm-dd"
            showButtonBar
          />
        </div>
        <div class="search-box">
          <label>Contact type:</label>
          <Select
            v-model="selectedContactType"
            :options="contactTypeOptions"
            placeholder="All"
            showClear
          />
        </div>
        <div class="search-box">
          <label>Activity type:</label>
          <Select
            v-model="selectedActivityType"
            :options="activityTypeOptions"
            placeholder="All"
            showClear
          />
        </div>
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

    <!-- Mobile card view -->
    <div v-if="friends !== null && !isLoading" class="friend-cards mobile-only">
      <div v-for="f in sortedFriends" :key="f.friendId" class="friend-card">
        <div class="card-row">
          <span class="label">Date:</span>
          <span>{{ f.visitDate }}</span>
        </div>
        <div v-if="isMetaMode" class="card-row">
          <span class="label">Village:</span>
          <span>{{ f.village?.name ?? '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">Member:</span>
          <span class="person-cell">
            {{ personName(f.member) }}
            <i
              v-if="isUnresolved(f.member)"
              class="pi pi-exclamation-triangle unresolved-icon"
              v-tooltip="'Name not matched to a person record'"
            />
          </span>
        </div>
        <div class="card-row">
          <span class="label">Volunteer:</span>
          <span class="person-cell">
            {{ personName(f.volunteer) }}
            <i
              v-if="isUnresolved(f.volunteer)"
              class="pi pi-exclamation-triangle unresolved-icon"
              v-tooltip="'Name not matched to a person record'"
            />
          </span>
        </div>
        <div class="card-row">
          <span class="label">Contact:</span>
          <Tag
            v-if="f.contactType"
            :value="f.contactType"
            :severity="getContactTypeSeverity(f.contactType)"
          />
        </div>
        <div class="card-row card-row--wrap">
          <span class="label">Activities:</span>
          <div class="activity-tags">
            <Tag
              v-for="activity in (f.activityTypes ?? [])"
              :key="activity"
              :value="activity"
              severity="secondary"
            />
          </div>
        </div>
        <div class="card-row">
          <span class="label">Time:</span>
          <span>{{ f.timeSpentMinutes }} min</span>
        </div>
        <div v-if="f.notes" class="card-row">
          <span class="label">Notes:</span>
          <i
            class="pi pi-file-edit notes-icon"
            style="cursor: pointer"
            @click="toggleNotes($event, f.friendId + '-card')"
          />
          <Popover :ref="el => registerPopover(el, f.friendId + '-card')">
            <div class="notes-popover">{{ f.notes }}</div>
          </Popover>
        </div>
      </div>
    </div>

    <!-- Desktop table view -->
    <DataTable
      v-if="friends !== null && !isLoading"
      :value="sortedFriends"
      class="friend-table desktop-only"
      row-hover
      stripedRows
      :sortField="sortField"
      :sortOrder="sortOrder"
      @sort="onSort"
      :pt="{ tableContainer: { style: 'overflow: visible;' }, thead: { style: 'top: var(--breadcrumb-height); z-index: 1;' }, headerRow: { style: 'background: var(--color-background-light);' } }"
    >
      <Column field="visitDate" header="Visit Date" sortable style="width: 10%" />

      <Column v-if="isMetaMode" header="Village" style="width: 12%">
        <template #body="{ data }">
          {{ data.village?.name ?? '—' }}
        </template>
      </Column>

      <Column header="Member" sortable sortField="memberName" style="width: 14%">
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

      <Column header="Volunteer" sortable sortField="volunteerName" style="width: 14%">
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

      <Column header="Contact Type" sortable field="contactType" style="width: 11%">
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
  border: 1px solid var(--color-border-default);
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
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  background: var(--color-background-light);
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.search-box {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 0 0 auto;
  width: 200px;
}

.search-box label {
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 0.9rem;
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

/* Mobile card view */
.friend-cards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.friend-card {
  padding: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
}

.card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  gap: 0.5rem;
}

.card-row--wrap {
  align-items: flex-start;
}

.card-row .label {
  color: var(--color-text-dim);
  flex-shrink: 0;
}

/* Responsive */
.desktop-only {
  width: 100%;
}

.mobile-only {
  display: none;
}

@media (max-width: 768px) {
  .friend-list {
    padding: 1rem;
  }

  .desktop-only {
    display: none;
  }

  .mobile-only {
    display: flex;
  }

  .search-box {
    width: 100%;
  }
}
</style>
