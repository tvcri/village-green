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
  name, phone, email, selectedVillage, selectedVillageId,
  filteredPersons, hasFilter, circleNameById, clearAll: clearFilters
} = usePersonListFilters(persons, allVillages, allCircles)

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

function parseJson(val) {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return [] }
  }
  return []
}

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
  { header: 'Roles', key: 'roles' },
  ...personExportColumns({ birthDate: canReadBirthDate.value, demographics: canReadDemographics.value }),
])

// Rows are summary shape plus the projected `detail` object; email/phone/cell
// come from the summary root (detail deliberately omits them).
function detailRowForCsv(p) {
  const { phone, cell } = parsePhoneObj(p.phone)
  return {
    fullName: p.fullName,
    villageName: p.village?.name ?? '',
    roles: parseJson(p.activeAs).join(', '),
    ...personExportValues({ ...(p.detail ?? {}), email: p.email, phone, cell }),
  }
}

// Fetch projection=detail at export time — full rows (with circles/disabilities
// subqueries) are paid only here, never for the live list — and keep exactly
// the people on screen, in screen order. The village goes to the server too,
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
      .map(p => byId.get(p.personId))
      .filter(Boolean)
      .map(detailRowForCsv)
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

// The table header sticks below the filter bar, whose height varies (the
// filters wrap on narrower windows), so its offset follows the measured bar.
const listRoot = ref(null)
const toolbar = ref(null)
let toolbarObserver = null
onMounted(() => {
  toolbarObserver = new ResizeObserver(() => {
    listRoot.value?.style.setProperty('--toolbar-height', `${toolbar.value?.offsetHeight ?? 0}px`)
  })
  toolbarObserver.observe(toolbar.value)
})
onBeforeUnmount(() => toolbarObserver?.disconnect())

// When a filter changes while scrolled down the list, bring the first matches
// up under the sticky header instead of leaving the view somewhere mid-list.
watch([name, phone, email, selectedVillage], async () => {
  await nextTick()
  const table = listRoot.value?.querySelector('.person-table')
  if (!table || !toolbar.value) return
  const stuckAt = toolbar.value.getBoundingClientRect().bottom
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

    <div ref="toolbar" class="toolbar">
      <div class="filters">
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
        <div class="filter-actions">
          <Button
            icon="pi pi-times"
            severity="secondary"
            text
            aria-label="Clear filters"
            :disabled="!hasFilter"
            @click="clearFilters"
          />
        </div>
      </div>

      <div class="role-filters">
        <span v-if="filteredPersons !== null" class="result-count">
          {{ filteredPersons.length }} {{ filteredPersons.length === 1 ? 'person' : 'persons' }}
        </span>
        <ExportButton
          :disabled="isLoading || isCreatingSheet || isFetchingExport || !filteredPersons?.length"
          @download="handleDownloadCsv"
          @export="handleCreateSheet"
        />
      </div>
    </div>

    <div v-if="filteredPersons === null" class="empty-state">
      {{ isLoading ? 'Loading persons…' : 'Persons could not be loaded.' }}
    </div>

    <div v-else-if="!isLoading && filteredPersons.length === 0" class="empty-state">
      No persons found.
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

/* Filters + role checkboxes stick under the breadcrumbs while the list
   scrolls; opaque so rows pass beneath it. */
.toolbar {
  position: sticky;
  top: var(--breadcrumb-height);
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: -0.75rem 0;
  padding: 0.75rem 0;
  background: var(--color-background-dark);
}

.filter-name {
  flex-grow: 2;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

/* Inputs grow to share the leftover horizontal space (min-width keeps them
   readable before wrapping); the action buttons stay their natural size and
   push flush-right, dropping to a second line only when the row can't hold
   everything. */
.filter-input {
  flex: 1 1 9rem;
  min-width: 9rem;
}

.filter-input :deep(.p-inputtext) {
  width: 100%;
}

.filter-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-left: auto;
}

.role-filters {
  display: flex;
  gap: 1.5rem;
  align-items: center;
}

/* Count beside Download: always in view in the sticky bar, and it is the
   number of rows the download will hold. */
.result-count {
  margin-left: auto;
}

.role-tags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.result-count {
  font-size: 0.9rem;
  color: var(--color-text-dim);
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
   component (or tooltip directive) per tag. Colours follow the Aura tag
   tokens, with the primitives as fallback because the --p-tag-* vars only
   exist once a Tag has mounted somewhere. */
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
  background: var(--p-tag-info-background, var(--p-sky-100));
  color: var(--p-tag-info-color, var(--p-sky-700));
}

.role-tag--volunteer {
  background: var(--p-tag-success-background, var(--p-green-100));
  color: var(--p-tag-success-color, var(--p-green-700));
}

.role-tag--dropped {
  background: var(--p-tag-secondary-background, var(--p-surface-100));
  color: var(--p-tag-secondary-color, var(--p-surface-600));
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
  background: var(--p-tag-secondary-background, var(--p-surface-100));
  color: var(--p-tag-secondary-color, var(--p-surface-600));
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
  /* The stacked filters would cover the screen; let them scroll away. */
  .toolbar {
    position: static;
  }
  .person-table thead th {
    top: var(--breadcrumb-height);
  }
  .filters {
    flex-direction: column;
    align-items: stretch;
  }
  /* Let fields fill the column on narrow screens. */
  .filter-village,
  .filter-village :deep(.p-select),
  .filter-input {
    width: 100% !important;
  }
  .filter-actions {
    margin-left: 0;
  }
}
</style>
