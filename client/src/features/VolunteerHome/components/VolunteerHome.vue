<script setup>
import { computed, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
import Checkbox from 'primevue/checkbox'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { serviceDateToDate, timeStringToLabel } from '../../ServiceRequestList/lib/timeFields.js'
import { getVolunteerRequests, getVolunteerRequestVillages } from '../api/volunteerRequestApi.js'
import { getUser } from '../../../shared/api/userApi.js'
import { SERVICE_CATEGORIES } from '../lib/serviceCategories.js'

const router = useRouter()
const route = useRoute()

// The active tab lives in the URL (?tab=) so it survives remount on return
// from a request detail — restored by both the detail's Back button and
// native browser back. Falls back to 'open' for absent/unknown values.
const VALID_TABS = ['open', 'mine', 'history']
const activeTab = ref(VALID_TABS.includes(route.query.tab) ? route.query.tab : 'open')
const openPageRows = ref(10)
const myPageRows = ref(10)
const historyPageRows = ref(10)

// 'open' is the default tab, fetched eagerly; 'mine'/'history' are fetched
// lazily the first time their tab is actually viewed, then cached for the
// rest of the component's lifetime (no refetch on switching back).
// onError: null keeps a failed open-list fetch out of the global crash-style
// error modal — a 403/500 on the primary list shows inline instead (mirrors
// VillageList). Surfaced via the `openError` banner below the filters.
const { state: openRequests, isLoading: openLoading, error: openError } = useAsyncState(
  () => getVolunteerRequests('open'),
  { immediate: true, initialState: [], onError: null }
)

const { state: myRequests, isLoading: mineLoading, error: mineError, execute: fetchMine } = useAsyncState(
  () => getVolunteerRequests('mine'),
  { immediate: false, initialState: [], onError: null }
)

const { state: historyRequests, isLoading: historyLoading, error: historyError, execute: fetchHistory } = useAsyncState(
  () => getVolunteerRequests('history'),
  { immediate: false, initialState: [], onError: null }
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

// onError: null: a failed village-filter fetch degrades the filter to no
// options rather than crashing the page (the request list is the primary
// content and has its own error surface).
const { state: villageOptions } = useAsyncState(
  () => getVolunteerRequestVillages(),
  { immediate: true, initialState: [], onError: null }
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

// Mirror the active tab into the URL. Use replace (not push) so switching
// tabs never creates browser-history entries; merge into the existing query
// to preserve any other params.
watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } })
})

// The category key for a request's serviceName, by the same prefix match as the
// filter (absorbs whitespace-after-colon). null when it matches no category —
// such a card gets no accent stripe (neutral).
function requestCategoryKey(row) {
  const name = row.serviceName ?? ''
  return SERVICE_CATEGORIES.find(c => name.startsWith(c.prefix))?.key ?? null
}

// Class for the Service tag; uncategorized services fall back to a neutral tag.
function serviceTagClass(row) {
  const key = requestCategoryKey(row)
  return key ? `service-tag--${key}` : 'service-tag--none'
}

// The caller's own held capabilities gate the Service filter options — a
// volunteer only ever sees categories they can actually pick up. Sourced from
// /user (identity-derived, staff-gate-exempt); no shared user store exists, so
// this is fetched independently, matching HeaderMenu/UserProfileMenu.
const { state: currentUser } = useAsyncState(
  () => getUser(),
  { immediate: true, initialState: null, onError: null }
)

const accountVolunteers = computed(() => currentUser.value?.volunteers ?? [])

const serviceCategoryOptions = computed(() => {
  // Union across the account's volunteers (shared household email): a
  // category is offered if ANY of them holds it — mirrors the API's
  // union-scoped open list.
  const held = new Set(accountVolunteers.value.flatMap(v => v.capabilities ?? []))
  return SERVICE_CATEGORIES.filter(c => held.has(c.label))
})

// A lone option is noise: checking/unchecking it just toggles to an empty
// table. Show the Service filter only when the caller holds 2+ categories.
const showServiceFilter = computed(() => serviceCategoryOptions.value.length >= 2)

// Volunteer attribution — only meaningful when the account has 2+ volunteers
// (shared household email); single-volunteer accounts see today's UI exactly.
const showVolunteerColumn = computed(() => accountVolunteers.value.length > 1)

function volunteerLabel(row) {
  // String() aligns with the detail view's lookup; both sides are CHAR-cast
  // strings today, so this is drift-proofing, not a conversion.
  return accountVolunteers.value.find(v => v.personId === String(row.volunteerPersonId))?.name ?? ''
}

const SERVICE_FILTER_KEY = 'vg.volunteerHome.serviceFilter'
let storedServiceFilter = []
try {
  storedServiceFilter = JSON.parse(localStorage.getItem(SERVICE_FILTER_KEY) ?? '[]')
}
catch {
  storedServiceFilter = []
}
// Selected category LABELS (human-readable in localStorage; resolved to
// prefixes at match time).
const selectedServiceLabels = ref(storedServiceFilter)

watch(selectedServiceLabels, (value) => {
  localStorage.setItem(SERVICE_FILTER_KEY, JSON.stringify(value))
})

// The prefixes for the currently-checked categories. Empty = no service filter.
// Intersect with the categories the caller actually holds (serviceCategoryOptions):
// a stored label for a since-revoked capability renders no pill, so it must not
// silently narrow the list either — and the user would have no pill to un-check it.
const selectedServicePrefixes = computed(() => {
  const heldLabels = new Set(serviceCategoryOptions.value.map(c => c.label))
  return SERVICE_CATEGORIES
    .filter(c => heldLabels.has(c.label) && selectedServiceLabels.value.includes(c.label))
    .map(c => c.prefix)
})

const filteredOpenRequests = computed(() => {
  return openRequests.value.filter((r) => {
    const villageMatch = !selectedVillageIds.value.length
      || selectedVillageIds.value.includes(r.villageId)
    const serviceMatch = !selectedServicePrefixes.value.length
      || selectedServicePrefixes.value.some(prefix => (r.serviceName ?? '').startsWith(prefix))
    return villageMatch && serviceMatch
  })
})

// Wall-clock civil values: serviceDate ('YYYY-MM-DD') and startTime
// ('HH:MM:SS') are never instants — render them via timeFields helpers,
// never new Date(value) (which would timezone-shift them). timesFlexible
// means "no specific time was set".
function formatWhen(row) {
  const d = serviceDateToDate(row.serviceDate)
  if (!d) return ''
  // VSS-only: prefix the weekday so volunteers can scan by day of week.
  const date = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  if (row.timesFlexible) return `${date} · Flexible`
  const time = timeStringToLabel(row.startTime)
  return time ? `${date} · ${time}` : date
}

function memberLabel(row) {
  return row.member?.fullName ?? ''
}

function goToDetail(row) {
  // Carry the originating tab so the detail's Back button can return the
  // volunteer to it. (Native browser back needs nothing extra — it pops
  // history straight to /volunteer?tab=<tab>, restored on mount.)
  router.push({
    name: 'volunteer-request-detail',
    params: { id: row.serviceRequestId },
    query: { from: activeTab.value }
  })
}
</script>

<template>
  <div class="volunteer-home">
    <h1>Volunteer Self Signup</h1>
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
              :show-toggle-all="false"
              show-clear
              :max-selected-labels="4"
              selected-items-label="{0} villages selected"
            />
            <template v-if="showServiceFilter">
              <div class="service-filters">
                <label
                  v-for="category in serviceCategoryOptions"
                  :key="category.label"
                  class="service-pill"
                  :class="[
                    `service-pill--${category.key}`,
                    { 'is-checked': selectedServiceLabels.includes(category.label) },
                  ]"
                  :for="`service-${category.label}`"
                >
                  <Checkbox
                    v-model="selectedServiceLabels"
                    :input-id="`service-${category.label}`"
                    :value="category.label"
                  />
                  {{ category.label }}
                </label>
              </div>
            </template>
          </div>
          <p v-if="openError" class="load-error">Couldn't load requests. Please try again later.</p>
          <DataTable
            :value="filteredOpenRequests"
            :loading="openLoading"
            dataKey="serviceRequestId"
            stripedRows
            paginator
            :rows="openPageRows"
            class="desktop-only"
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
            <Column field="serviceName" header="Service" sortable>
              <template #body="{ data }">
                <span class="service-tag" :class="serviceTagClass(data)">
                  {{ data.serviceName }}
                </span>
              </template>
            </Column>
            <Column field="villageName" header="Village" sortable />
            <Column header="Member">
              <template #body="{ data }">{{ memberLabel(data) }}</template>
            </Column>
            <Column field="serviceDate" header="When" sortable>
              <template #body="{ data }">{{ formatWhen(data) }}</template>
            </Column>
            <Column field="destination" header="Destination" />
          </DataTable>

          <!-- Mobile Card List -->
          <div class="request-cards mobile-only">
            <p v-if="!openLoading && !filteredOpenRequests.length" class="cards-empty">
              No open requests right now. Thanks for checking!
            </p>
            <div
              v-for="request in filteredOpenRequests"
              :key="request.serviceRequestId"
              class="request-card"
              @click="goToDetail(request)"
            >
              <span class="service-tag card-service-tag" :class="serviceTagClass(request)">
                {{ request.serviceName }}
              </span>
              <div class="card-row"><span class="label">When</span>{{ formatWhen(request) }}</div>
              <div class="card-row"><span class="label">Village</span>{{ request.villageName }}</div>
              <div class="card-row"><span class="label">Member</span>{{ memberLabel(request) }}</div>
              <div v-if="request.destination" class="card-row">
                <span class="label">Destination</span>{{ request.destination }}
              </div>
            </div>
          </div>
        </TabPanel>
        <TabPanel value="mine">
          <p v-if="mineError" class="load-error">Couldn't load your commitments. Please try again later.</p>
          <DataTable
            :value="myRequests"
            :loading="mineLoading"
            dataKey="serviceRequestId"
            stripedRows
            paginator
            :rows="myPageRows"
            class="desktop-only"
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
            <Column field="serviceName" header="Service" sortable>
              <template #body="{ data }">
                <span class="service-tag" :class="serviceTagClass(data)">
                  {{ data.serviceName }}
                </span>
              </template>
            </Column>
            <Column field="villageName" header="Village" sortable />
            <Column header="Member">
              <template #body="{ data }">{{ memberLabel(data) }}</template>
            </Column>
            <Column v-if="showVolunteerColumn" header="Volunteer">
              <template #body="{ data }">{{ volunteerLabel(data) }}</template>
            </Column>
            <Column field="serviceDate" header="When" sortable>
              <template #body="{ data }">{{ formatWhen(data) }}</template>
            </Column>
          </DataTable>

          <!-- Mobile Card List -->
          <div class="request-cards mobile-only">
            <p v-if="!mineLoading && !myRequests.length" class="cards-empty">
              You have no upcoming commitments.
            </p>
            <div
              v-for="request in myRequests"
              :key="request.serviceRequestId"
              class="request-card"
              @click="goToDetail(request)"
            >
              <span class="service-tag card-service-tag" :class="serviceTagClass(request)">
                {{ request.serviceName }}
              </span>
              <div class="card-row"><span class="label">When</span>{{ formatWhen(request) }}</div>
              <div class="card-row"><span class="label">Village</span>{{ request.villageName }}</div>
              <div class="card-row"><span class="label">Member</span>{{ memberLabel(request) }}</div>
              <div v-if="showVolunteerColumn" class="card-row">
                <span class="label">Volunteer</span>{{ volunteerLabel(request) }}
              </div>
            </div>
          </div>
        </TabPanel>
        <TabPanel value="history">
          <p v-if="historyError" class="load-error">Couldn't load your history. Please try again later.</p>
          <DataTable
            :value="historyRequests"
            :loading="historyLoading"
            dataKey="serviceRequestId"
            stripedRows
            paginator
            :rows="historyPageRows"
            class="desktop-only"
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
            <Column field="serviceName" header="Service" sortable>
              <template #body="{ data }">
                <span class="service-tag" :class="serviceTagClass(data)">
                  {{ data.serviceName }}
                </span>
              </template>
            </Column>
            <Column field="villageName" header="Village" sortable />
            <Column header="Member">
              <template #body="{ data }">{{ memberLabel(data) }}</template>
            </Column>
            <Column v-if="showVolunteerColumn" header="Volunteer">
              <template #body="{ data }">{{ volunteerLabel(data) }}</template>
            </Column>
            <Column field="serviceDate" header="When" sortable>
              <template #body="{ data }">{{ formatWhen(data) }}</template>
            </Column>
          </DataTable>

          <!-- Mobile Card List -->
          <div class="request-cards mobile-only">
            <p v-if="!historyLoading && !historyRequests.length" class="cards-empty">
              No completed requests yet.
            </p>
            <div
              v-for="request in historyRequests"
              :key="request.serviceRequestId"
              class="request-card"
              @click="goToDetail(request)"
            >
              <span class="service-tag card-service-tag" :class="serviceTagClass(request)">
                {{ request.serviceName }}
              </span>
              <div class="card-row"><span class="label">When</span>{{ formatWhen(request) }}</div>
              <div class="card-row"><span class="label">Village</span>{{ request.villageName }}</div>
              <div class="card-row"><span class="label">Member</span>{{ memberLabel(request) }}</div>
              <div v-if="showVolunteerColumn" class="card-row">
                <span class="label">Volunteer</span>{{ volunteerLabel(request) }}
              </div>
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.volunteer-home {
  padding: 2rem;

  /* Single source of truth for the per-category color treatments, shared by the
     Service tags (desktop cell + mobile card headline) and the filter pills.
     Each hue yields a soft fill (-bg) and a stronger border (-border), derived
     following the status-bg recipe in style.css: color-mixed into the theme
     background so they adapt to light/dark automatically. --color-background-light
     is the tag/pill surface. */
  --cat-home-help-bg: color-mix(in srgb, #3b82f6 26%, var(--color-background-light));
  --cat-home-help-border: color-mix(in srgb, #3b82f6 55%, var(--color-background-light));
  --cat-errands-bg: color-mix(in srgb, #f59e0b 26%, var(--color-background-light));
  --cat-errands-border: color-mix(in srgb, #f59e0b 55%, var(--color-background-light));
  --cat-rides-bg: color-mix(in srgb, #22c55e 26%, var(--color-background-light));
  --cat-rides-border: color-mix(in srgb, #22c55e 55%, var(--color-background-light));
  --cat-tech-support-bg: color-mix(in srgb, #8b5cf6 26%, var(--color-background-light));
  --cat-tech-support-border: color-mix(in srgb, #8b5cf6 55%, var(--color-background-light));
}

/* Page title — matches the other list pages (MemberList/VolunteerList): plain
   h1 at the UA default size, primary text color. Those pages wrap the h1 in a
   .header-row with margin-bottom:1rem; VolunteerHome has no header controls, so
   the same 1rem gap sits directly on the h1. */
h1 {
  margin: 0 0 1rem 0;
  color: var(--color-text-primary);
}

.filter-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
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
  max-width: 100%;
}

.service-filters {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  align-items: center;
}

/* Filter option as a pill — the same category tint as the Service tag, but
   larger (touch-friendly) with the checkbox living inside. Unchecked reads as a
   pale outline; checked "lights up" to the full category tint. */
.service-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

/* Each category exposes its tint via --pill-bg / --pill-border. Unchecked pills
   show a muted colored border (the category is hinted before selection);
   checked pills fill with the full tint. */
.service-pill--rides { --pill-bg: var(--cat-rides-bg); --pill-border: var(--cat-rides-border); }
.service-pill--errands { --pill-bg: var(--cat-errands-bg); --pill-border: var(--cat-errands-border); }
.service-pill--home-help { --pill-bg: var(--cat-home-help-bg); --pill-border: var(--cat-home-help-border); }
.service-pill--tech-support { --pill-bg: var(--cat-tech-support-bg); --pill-border: var(--cat-tech-support-border); }

.service-pill[class*='service-pill--'] {
  border-color: color-mix(in srgb, var(--pill-border) 50%, var(--color-border-default));
}

.service-pill.is-checked {
  background-color: var(--pill-bg);
  border-color: var(--pill-border);
}

/* Service category tag — soft tinted fill + stronger border, per category.
   Uncategorized services get a neutral tag. Used in the desktop Service column
   and as the mobile card headline. */
.service-tag {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary);
  background-color: var(--color-background-subtle);
}
.service-tag--rides {
  background-color: var(--cat-rides-bg);
  border-color: var(--cat-rides-border);
}
.service-tag--errands {
  background-color: var(--cat-errands-bg);
  border-color: var(--cat-errands-border);
}
.service-tag--home-help {
  background-color: var(--cat-home-help-bg);
  border-color: var(--cat-home-help-border);
}
.service-tag--tech-support {
  background-color: var(--cat-tech-support-bg);
  border-color: var(--cat-tech-support-border);
}

/* Mobile card list — mirrors the VolunteerList responsive pattern. Desktop
   shows the DataTable; below 768px the table is hidden and these cards show. */
.request-cards {
  display: none;
  flex-direction: column;
  gap: 0.75rem;
}

.request-card {
  padding: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.request-card:active {
  background-color: var(--color-background-subtle);
}

/* Service tag as the card headline — carries the category color (replaces the
   former left stripe). Block so its own margin-bottom separates it from the
   rows below; align-self via inline-flex keeps it hugging its text width. */
.card-service-tag {
  display: table;
  margin-bottom: 0.75rem;
  font-size: 1rem;
}

.request-card .card-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.request-card .card-row:last-child {
  margin-bottom: 0;
}

.request-card .card-row .label {
  color: var(--color-text-dim);
  margin-bottom: 0.15rem;
  font-size: 0.85rem;
}

.cards-empty {
  color: var(--color-text-dim);
  font-size: 0.9rem;
  margin: 0.5rem 0;
}

/* Inline "couldn't load" banner — a failed list fetch shows here instead of
   the global crash-style error modal (onError: null on those fetches). */
.load-error {
  color: var(--color-text-error);
  font-size: 0.95rem;
  margin: 0 0 1rem 0;
}

/* Card-style elevation on the tab panel container — matches the box-shadow the
   app uses on tables/cards elsewhere, but applied to the Tabs surface here. */
:deep(.p-tabs) {
  box-shadow: var(--box-shadow-card);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
}


@media (max-width: 768px) {
  .volunteer-home {
    padding: 1rem;
  }

  .desktop-only {
    display: none;
  }

  .request-cards.mobile-only {
    display: flex;
  }

  /* On narrow screens the pills wrap to two lines; a 2-column grid keeps the
     rows aligned (flex-wrap packs each row independently, so label-width pills
     don't line up). Pills stretch to fill their column for a tidy 2x2 block. */
  .service-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
  }

  .service-pill {
    justify-content: flex-start;
  }
}
</style>
