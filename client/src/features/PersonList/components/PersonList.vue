<script setup>
import { computed, ref, watch, onMounted, onActivated, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useCurrentUser } from '../../../shared/composables/useCurrentUser.js'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Button from 'primevue/button'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Checkbox from 'primevue/checkbox'
import Badge from 'primevue/badge'
import { useToast } from 'primevue/usetoast'
import ExportButton from '../../../components/ExportButton.vue'
import { getPersons, getCircles } from '../api/personApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { personExportColumns, personExportValues } from '../../../shared/lib/personExport.js'
import { createSheet } from '../../../shared/services/googleSheetsService.js'
import { useAnalytics } from '../../../shared/composables/useAnalytics.js'
import { usePersonListFilters } from '../composables/usePersonListFilters.js'
import { rowTagKeys, tagLabel, circleShortName, isEmailPaused } from '../lib/personTags.js'
import { todayCivilDateIn } from '../../../shared/lib/civilDate.js'
import { PAUSE_TIME_ZONE, pauseTag } from '../../../shared/lib/volunteerPause.js'

defineOptions({ name: 'PersonList' })

const router = useRouter()
const { hasPermission } = useCurrentUser()
const canWritePerson = computed(() => hasPermission('person:write'))
const { trackEvent } = useAnalytics()

let toast = null
onMounted(() => {
  toast = useToast()
})

useScrollRestore('meta-persons', 'meta-person-detail')

// Village and circle catalogs for the filters and tag labels.
const { state: allVillages } = useAsyncState(() => getVillages(), { immediate: true })
const { state: allCircles } = useAsyncState(() => getCircles(), { immediate: true })
const villageOptions = computed(() => [
  'All villages',
  ...(allVillages.value ?? []).map(v => v.name)
])

// The list opens fully populated: every person the caller can read, with or
// without an active role. All filtering is client-side and live, as you type.
const { state: persons, isLoading, execute: fetchPersons } = useAsyncState(
  () => getPersons({}),
  { immediate: true }
)

const {
  name, phone, email, selectedVillage, selectedVillageId, selectedTags, matchMode,
  emailPausedOnly, veteranOnly, filteredPersons, activeFilterCount, hasFilter,
  sentence, circleNameById, clearAll: clearFilters
} = usePersonListFilters(persons, allVillages, allCircles)

// Federation-scope checks, matching the unscoped list fetch: who may see
// dropped/pending members and volunteers, and filter on veteran status.
const canSeeNoncurrentMember = computed(() => hasPermission('member:read_inactive'))
const canSeeNoncurrentVolunteer = computed(() => hasPermission('volunteer:read_inactive'))
const canFilterVeteran = computed(() => hasPermission('person:read_demographics'))

const filtersCollapsed = ref(false)
const matchOptions = [
  { label: 'Any', value: 'any' },
  { label: 'All', value: 'all' },
  { label: 'Exactly these', value: 'exact' }
]

// Picker contents: role statuses (active only without the read_inactive
// grant) and every catalog circle by name.
const memberStatuses = computed(() => canSeeNoncurrentMember.value ? ['active', 'pending', 'dropped'] : ['active'])
const volunteerStatuses = computed(() => canSeeNoncurrentVolunteer.value ? ['active', 'pending', 'dropped'] : ['active'])
const circleChoices = computed(() =>
  [...(allCircles.value ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(c => ({ key: `circle:${c.circleId}`, name: c.name, short: circleShortName(c.name) })))
function isSelected (key) { return selectedTags.value.includes(key) }
function toggleTag (key) {
  selectedTags.value = isSelected(key)
    ? selectedTags.value.filter(k => k !== key)
    : [...selectedTags.value, key]
}

// person:read_birth_date: the API omits birthDate for holders without it, so
// the export drops the column rather than shipping it empty. With a village
// filter the check is for that village (village-scoped holders); across all
// villages only a federation grant applies.
const canReadBirthDate = computed(() => hasPermission('person:read_birth_date', selectedVillageId.value))
// person:read_demographics, the same way, for gender/ethnicity/race/veteran.
const canReadDemographics = computed(() => hasPermission('person:read_demographics', selectedVillageId.value))

// Every person renders in one list. A plain table rather than a DataTable:
// DataTable's per-row overhead made ~2,000 rows take over 5 s to mount. The
// page scrolls as a whole; the filter bar sticks under the breadcrumbs and
// the table header under the filter bar.
const sortField = ref('fullName')
const sortOrder = ref(1)
const sortKey = { fullName: p => p.fullName ?? '', village: p => p.village?.name ?? '' }
function toggleSort (field) {
  if (sortField.value === field) sortOrder.value = -sortOrder.value
  else { sortField.value = field; sortOrder.value = 1 }
}
function sortIcon (field) {
  if (sortField.value !== field) return 'pi pi-sort-alt'
  return sortOrder.value === 1 ? 'pi pi-sort-amount-up-alt' : 'pi pi-sort-amount-down'
}

// keep-alive holds the list while a person is opened; re-fetch on return so
// creates and edits show up (the first activation is the initial load).
let activatedOnce = false
onActivated(() => {
  if (activatedOnce) fetchPersons()
  activatedOnce = true
})

const sortedPersons = computed(() => {
  if (!filteredPersons.value) return null
  const key = sortKey[sortField.value]
  return [...filteredPersons.value].sort((a, b) => sortOrder.value * key(a).localeCompare(key(b)))
})

function parsePhoneObj(val) {
  if (val && typeof val === 'object') return val
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return {} }
  }
  return {}
}

// Today's civil date, as the server computes it for pause rules; the pause
// mark and its tooltip are both derived from it.
const today = computed(() => todayCivilDateIn(PAUSE_TIME_ZONE))

// Role tags for a row: member and volunteer only (circles have their own
// column). A deceased person reads as dropped in every role and says so.
function roleTags (p) {
  return rowTagKeys(p)
    .filter(key => !key.startsWith('circle:'))
    .map(key => {
      const [kind, status] = key.split(':')
      const role = kind === 'member' ? 'Member' : 'Volunteer'
      const label = p.deceased ? `${role} (deceased)` : tagLabel(key, circleNameById.value)
      const pause = kind === 'volunteer' && isEmailPaused(p, today.value)
        ? pauseTag(p.volunteerPause, today.value)
        : null
      return { key, kind, status, role, label, pause }
    })
}

const isCreatingSheet = ref(false)
const isFetchingExport = ref(false)

// Fixed export column list (order and headers are the contract, never derived
// from row keys). Exports carry the full Person shape; the live table stays
// on summary rows.
const columnsForCsv = computed(() => [
  { header: 'Name', key: 'fullName' },
  { header: 'Village', key: 'villageName' },
  { header: 'Member Status', key: 'memberStatus' },
  { header: 'Volunteer Status', key: 'volunteerStatus' },
  ...personExportColumns({ birthDate: canReadBirthDate.value, demographics: canReadDemographics.value }),
])

// Rows are summary shape plus the projected `detail` object; email/phone/cell
// come from the summary root (detail deliberately omits them).
function detailRowForCsv(p) {
  const { phone, cell } = parsePhoneObj(p.phone)
  return {
    fullName: p.fullName,
    villageName: p.village?.name ?? '',
    memberStatus: p.memberStatus,
    volunteerStatus: p.volunteerStatus,
    ...personExportValues({ ...(p.detail ?? {}), email: p.email, phone, cell }),
  }
}

// Fetch projection=detail at export time — full rows (with circles/disabilities
// subqueries) are paid only here, never for the live list — and keep exactly
// the people on screen, in screen order. Statuses come from the on-screen
// summary row (what the grid shows this caller), not the export fetch. The village goes to the server too,
// so its birthDate/demographics gating matches canReadBirthDate and
// canReadDemographics above.
async function fetchRowsForExport() {
  try {
    isFetchingExport.value = true
    const detail = await getPersons({
      villageId: selectedVillageId.value ? [selectedVillageId.value] : undefined,
      projection: ['detail']
    })
    const byId = new Map(detail.map(p => [p.personId, p]))
    return (sortedPersons.value ?? [])
      .filter(p => byId.has(p.personId))
      .map(p => detailRowForCsv({ ...byId.get(p.personId), memberStatus: p.memberStatus, volunteerStatus: p.volunteerStatus }))
  } finally {
    isFetchingExport.value = false
  }
}

async function handleDownloadCsv() {
  try {
    const rows = await fetchRowsForExport()
    const csv = toCsv(rows, columnsForCsv.value)
    downloadCsv(csv, 'persons.csv')
  } catch (err) {
    if (toast) {
      toast.add({ severity: 'error', summary: 'Export Failed', detail: err.message, life: 5000 })
    } else {
      console.error(err)
    }
  }
}

async function handleCreateSheet() {
  try {
    isCreatingSheet.value = true

    const rows = await fetchRowsForExport()
    const result = await createSheet(rows, columnsForCsv.value, 'Village Green Persons')
    const sheetUrl = result.url || result

    if (result.popupBlocked) {
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

function navigateToPerson(personId, fullName) {
  router.push({
    name: 'meta-person-detail',
    params: { personId, personName: fullName },
    query: { from: 'meta' }
  })
}

// One analytics event per filtering session, not per keystroke.
watch(hasFilter, (now, was) => {
  if (now && !was) trackEvent('filter_applied')
})

// The table header sticks below the filters header row (the only sticky part
// of the panel), whose height varies when it wraps, so its offset follows the
// measured row.
const listRoot = ref(null)
const filtersHeader = ref(null)
let headerObserver = null
onMounted(() => {
  headerObserver = new ResizeObserver(() => {
    listRoot.value?.style.setProperty('--toolbar-height', `${filtersHeader.value?.offsetHeight ?? 0}px`)
  })
  headerObserver.observe(filtersHeader.value)
})
onBeforeUnmount(() => headerObserver?.disconnect())

// When a filter changes while scrolled down the list, bring the first matches
// up under the sticky header instead of leaving the view somewhere mid-list.
watch([name, phone, email, selectedVillage, selectedTags, matchMode, emailPausedOnly, veteranOnly], async () => {
  await nextTick()
  const table = listRoot.value?.querySelector('.person-table')
  if (!table || !filtersHeader.value) return
  const stuckAt = filtersHeader.value.getBoundingClientRect().bottom
  const tableTop = table.getBoundingClientRect().top
  if (tableTop < stuckAt) window.scrollBy(0, tableTop - stuckAt)
})
</script>

<template>
  <div ref="listRoot" class="person-list">
    <div class="list-header">
      <h2>Persons</h2>
      <div class="header-actions">
        <Button v-if="canWritePerson" label="New Person" icon="pi pi-plus" @click="$router.push({ name: 'meta-person-create' })" />
        <Button v-if="canWritePerson" label="Import Application" icon="pi pi-file-import" severity="secondary"
          @click="$router.push({ name: 'meta-person-import' })" />
      </div>
    </div>

    <div ref="filtersHeader" class="filters-header">
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
      <span v-if="filteredPersons !== null" class="filter-count-tag">
        {{ filteredPersons.length }} of {{ persons.length }} {{ persons.length === 1 ? 'person' : 'persons' }}
        <span
          v-if="hasFilter"
          role="button"
          class="clear-filters-icon"
          tabindex="0"
          title="Clear all filters"
          @click.prevent="clearFilters()"
          @keydown.enter.prevent="clearFilters()"
          @keydown.space.prevent="clearFilters()"
        >✕</span>
      </span>
      <div class="header-export">
        <ExportButton
          :disabled="isLoading || isCreatingSheet || isFetchingExport || !filteredPersons?.length"
          @download="handleDownloadCsv"
          @export="handleCreateSheet"
        />
      </div>
    </div>

    <div v-if="!filtersCollapsed" class="filters-content">
      <div class="filters-line">
        <Select
          v-model="selectedVillage"
          :options="villageOptions"
          placeholder="Village"
          class="filter-village"
          :pt="{ root: { style: 'width: 12rem;' } }"
        />
        <IconField class="filter-input filter-name">
          <InputIcon class="pi pi-user" />
          <InputText v-model="name" placeholder="Name" />
        </IconField>
        <IconField class="filter-input">
          <InputIcon class="pi pi-phone" />
          <InputText v-model="phone" placeholder="Phone" />
        </IconField>
        <IconField class="filter-input">
          <InputIcon class="pi pi-envelope" />
          <InputText v-model="email" placeholder="Email" />
        </IconField>
      </div>

      <div class="filter-groups">
        <div class="filter-group" role="group" aria-label="Member">
          <span class="filter-group-label">Member</span>
          <div class="picker-items">
            <button
              v-for="s in memberStatuses"
              :key="`member:${s}`"
              type="button"
              class="picker-item"
              :class="{ selected: isSelected(`member:${s}`) }"
              :aria-pressed="isSelected(`member:${s}`)"
              @click="toggleTag(`member:${s}`)"
            >
              <span class="role-tag role-tag--member" :class="`role-tag--${s}`">Member</span>
              <span class="picker-caption">{{ s }}</span>
            </button>
          </div>
        </div>

        <div class="filter-group" role="group" aria-label="Volunteer">
          <span class="filter-group-label">Volunteer</span>
          <div class="picker-items">
            <button
              v-for="s in volunteerStatuses"
              :key="`volunteer:${s}`"
              type="button"
              class="picker-item"
              :class="{ selected: isSelected(`volunteer:${s}`) }"
              :aria-pressed="isSelected(`volunteer:${s}`)"
              @click="toggleTag(`volunteer:${s}`)"
            >
              <span class="role-tag role-tag--volunteer" :class="`role-tag--${s}`">Volunteer</span>
              <span class="picker-caption">{{ s }}</span>
            </button>
          </div>
        </div>

        <div class="filter-group" role="group" aria-label="Circles">
          <span class="filter-group-label">Circles</span>
          <div class="picker-items">
            <button
              v-for="c in circleChoices"
              :key="c.key"
              type="button"
              class="picker-item"
              :class="{ selected: isSelected(c.key) }"
              :aria-pressed="isSelected(c.key)"
              :title="c.name"
              @click="toggleTag(c.key)"
            >
              <span class="circle-pill">{{ c.short }}</span>
            </button>
          </div>
        </div>

        <div class="filter-group" role="group" aria-label="Match">
          <span class="filter-group-label">Match</span>
          <div class="match-row">
            <SelectButton
              v-model="matchMode"
              :options="matchOptions"
              option-label="label"
              option-value="value"
              :allow-empty="false"
            />
            <span v-if="sentence" class="selection-sentence">{{ sentence }}</span>
          </div>
        </div>

        <div class="filter-group" role="group" aria-label="Also">
          <span class="filter-group-label">Also</span>
          <label class="also-option">
            <Checkbox v-model="emailPausedOnly" binary />
            <span>Email paused</span>
          </label>
          <label v-if="canFilterVeteran" class="also-option">
            <Checkbox v-model="veteranOnly" binary />
            <span>Veteran</span>
          </label>
        </div>
      </div>
    </div>

    <div v-if="filteredPersons === null" class="empty-state">
      {{ isLoading ? 'Loading persons…' : 'Persons could not be loaded.' }}
    </div>

    <div v-else-if="!isLoading && filteredPersons.length === 0" class="empty-state">
      <template v-if="hasFilter">
        No persons match these filters.
        <div v-if="sentence">{{ sentence }}</div>
      </template>
      <template v-else>No persons found.</template>
    </div>

    <table v-else class="person-table">
      <colgroup>
        <col style="width: 20%"><col style="width: 12%"><col style="width: 15%"><col style="width: 10%">
        <col style="width: 11%"><col style="width: 11%"><col style="width: 21%">
      </colgroup>
      <thead>
        <tr>
          <th class="sortable" :class="{ sorted: sortField === 'fullName' }" @click="toggleSort('fullName')">
            Name <i :class="sortIcon('fullName')" />
          </th>
          <th class="sortable" :class="{ sorted: sortField === 'village' }" @click="toggleSort('village')">
            Village <i :class="sortIcon('village')" />
          </th>
          <th>Roles</th>
          <th>Circles</th>
          <th>Phone</th>
          <th>Cell</th>
          <th>Email</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="p in sortedPersons"
          :key="p.personId"
          :class="{ deceased: p.deceased }"
          @click="navigateToPerson(p.personId, p.fullName)"
        >
          <td>{{ p.fullName }}</td>
          <td>{{ p.village?.name }}</td>
          <td>
            <div class="role-tags">
              <span
                v-for="t in roleTags(p)"
                :key="t.key"
                class="role-tag"
                :class="[`role-tag--${t.kind}`, `role-tag--${t.status}`]"
                :title="t.label"
                :aria-label="t.pause ? `${t.label}, ${t.pause}` : t.label"
              >
                {{ t.role }}
                <i v-if="t.pause" class="pi pi-pause-circle pause-mark" :title="t.pause" />
              </span>
            </div>
          </td>
          <td>
            <div class="role-tags">
              <span
                v-for="c in p.circles ?? []"
                :key="c.circleId"
                class="circle-pill"
                :title="c.name"
              >{{ circleShortName(c.name) }}</span>
            </div>
          </td>
          <td>{{ parsePhoneObj(p.phone).phone || '—' }}</td>
          <td>{{ parsePhoneObj(p.phone).cell || '—' }}</td>
          <td>{{ p.email || '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.person-list {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.list-header h2 {
  margin: 0;
  color: var(--color-text-primary);
}

/* Only the header row sticks under the breadcrumbs; opaque so rows pass
   beneath it. The panel below scrolls away. */
.filters-header {
  position: sticky;
  top: var(--breadcrumb-height);
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: -0.5rem 0;
  padding: 0.5rem 0;
  background: var(--color-background-dark);
}

.filters-btn-label { font-weight: 700; }
.filters-chevron { font-size: 0.75rem; transition: transform 0.2s ease; }
.filters-chevron.collapsed { transform: rotate(-90deg); }

.filter-count-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  background-color: var(--color-background-subtle);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  font-size: 0.875rem;
  color: var(--color-text-primary);
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
.clear-filters-icon:hover { color: var(--color-text-primary); }

.header-export {
  margin-left: auto;
}

.filters-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: -0.75rem;
  padding: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
}

.filters-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.filter-name {
  flex-grow: 2;
}

/* Inputs grow to share the leftover horizontal space (min-width keeps them
   readable before wrapping). */
.filter-input {
  flex: 1 1 9rem;
  min-width: 9rem;
}

.filter-input :deep(.p-inputtext) {
  width: 100%;
}

.filter-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 0;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0 1.25rem;
  border-left: 1px solid var(--color-border-default);
}

.filter-group:first-child {
  padding-left: 0;
  border-left: 0;
}

.filter-group-label {
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.picker-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* The picker reuses the grid's tag and pill visuals; unselected dimmed,
   selected ringed. */
.picker-item {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.2rem 0.4rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--color-text-dim);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  opacity: 0.6;
}

.picker-item:hover,
.picker-item:focus-visible {
  opacity: 1;
}

.picker-item.selected {
  opacity: 1;
  border-color: var(--p-primary-color);
  box-shadow: 0 0 0 1px var(--p-primary-color);
  color: var(--color-text-primary);
}

.match-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}

.selection-sentence {
  font-size: 0.85rem;
  color: var(--color-text-dim);
}

.also-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.role-tags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.person-table {
  cursor: pointer;
}

/* Plain table styled with the PrimeVue semantic tokens the DataTable theme
   resolves to (its own --p-datatable-* vars exist only once a DataTable has
   mounted). Fixed layout
   so the colgroup widths hold; one line per cell, long values truncated. */
.person-table {
  width: 100%;
  min-width: 50rem;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  background: var(--p-content-background);
  color: var(--p-content-color);
}

.person-table th,
.person-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-bottom: 1px solid var(--p-content-border-color);
}

.person-table thead th {
  position: sticky;
  top: calc(var(--breadcrumb-height) + var(--toolbar-height, 0px));
  z-index: 1;
  background: var(--p-content-background);
  color: var(--p-content-color);
  font-weight: 600;
}

.person-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.person-table th.sortable i {
  margin-left: 0.5rem;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.person-table th.sorted {
  /* The highlight token is translucent; layer it on an opaque base so rows
     scrolling under the sticky header don't show through. */
  background: linear-gradient(var(--p-highlight-background), var(--p-highlight-background)), var(--p-content-background);
  color: var(--p-highlight-color);
}

.person-table th.sorted i {
  color: var(--p-highlight-color);
}

.person-table tbody tr:nth-child(even) {
  background: var(--color-background-subtle);
}

.person-table tbody tr:hover {
  background: var(--p-content-hover-background);
}

/* Role tags are plain spans, not PrimeVue Tags: ~2,000 rows rule out a
   component (or tooltip directive) per tag. The --p-tag-* theme vars exist
   only once a Tag has mounted, so the colours come from the palette
   primitives (always present) and follow the app's dark mode, the
   `.app-dark` class on <html>, with the same light/dark pairs Aura's Tag
   uses. Defined on the component root so the filter picker shares them. */
.person-list {
  --tag-member-bg: var(--p-sky-100);
  --tag-member-fg: var(--p-sky-700);
  --tag-volunteer-bg: var(--p-green-100);
  --tag-volunteer-fg: var(--p-green-700);
  --tag-muted-bg: var(--p-surface-100);
  --tag-muted-fg: var(--p-surface-600);
}

/* html.app-dark out-specifies the scoped light rule, so source order is irrelevant. */
:global(html.app-dark .person-list) {
  --tag-member-bg: color-mix(in srgb, var(--p-sky-500), transparent 84%);
  --tag-member-fg: var(--p-sky-300);
  --tag-volunteer-bg: color-mix(in srgb, var(--p-green-500), transparent 84%);
  --tag-volunteer-fg: var(--p-green-300);
  --tag-muted-bg: var(--p-surface-800);
  --tag-muted-fg: var(--p-surface-300);
}

.role-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--p-content-border-radius, 6px);
  font-size: 0.8rem;
  font-weight: 700;
}

.role-tag--member {
  background: var(--tag-member-bg);
  color: var(--tag-member-fg);
}

.role-tag--volunteer {
  background: var(--tag-volunteer-bg);
  color: var(--tag-volunteer-fg);
}

.role-tag--dropped {
  background: var(--tag-muted-bg);
  color: var(--tag-muted-fg);
}

/* Pending: outline only, in the role's own colour. */
.role-tag--pending {
  background: transparent;
  border: 1px dashed currentColor;
}

.pause-mark {
  font-size: 0.8rem;
}

.circle-pill {
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.8rem;
  background: var(--tag-muted-bg);
  color: var(--tag-muted-fg);
}

.role-tags {
  flex-wrap: nowrap;
}

/* Deceased: hatched, dimmed, tags grey; the row still opens the record. */
.person-table tbody tr.deceased {
  background-image: repeating-linear-gradient(
    135deg, transparent 0 6px,
    color-mix(in srgb, var(--p-text-muted-color) 22%, transparent) 6px 7px);
  color: var(--p-text-muted-color);
}

.person-table tbody tr.deceased .role-tag,
.person-table tbody tr.deceased .circle-pill {
  filter: grayscale(1);
}

.empty-state {
  color: var(--color-text-dim);
  font-style: italic;
  padding: 2rem 0;
  text-align: center;
}

@media (max-width: 768px) {
  .person-list {
    padding: 1rem;
  }
  /* Nothing sticks on small screens: the stacked panel would cover the view. */
  .filters-header {
    position: static;
  }
  .person-table thead th {
    top: var(--breadcrumb-height);
  }
  .filters-line {
    flex-direction: column;
    align-items: stretch;
  }
  .filter-village,
  .filter-village :deep(.p-select),
  .filter-input {
    width: 100% !important;
  }
  /* In a column the 9rem flex-basis would become the field's height. */
  .filter-input {
    flex: 0 0 auto;
  }
  .filter-groups {
    flex-direction: column;
    gap: 1rem;
  }
  .filter-group {
    padding: 0;
    border-left: 0;
  }
}
</style>
