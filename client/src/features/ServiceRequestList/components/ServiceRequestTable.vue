<script setup>
import { ref, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import Select from 'primevue/select'
import { useAnalytics } from '../../../shared/composables/useAnalytics.js'
import { useStatusSeverity } from '../../../shared/composables/useStatusSeverity.js'
import { formatServiceDate, serviceDateTimeSortKey } from '../lib/timeFields.js'

defineOptions({ name: 'ServiceRequestTable' })

const props = defineProps({
  rows: { type: Array, required: true },
  isLoading: { type: Boolean, required: true },
  hasLoadedOnce: { type: Boolean, required: true },
  error: { type: Error, required: true },
  showVillageColumn: { type: Boolean, default: false },
  flashRowId: { type: [String, Number], default: null },
  // Initial serviceDate sort: 1 = ascending (soonest first), -1 = descending.
  // The lists default to ascending so upcoming work reads in the order it will
  // happen. Users can still re-sort by clicking a column header.
  sortOrder: { type: Number, default: 1 }
})

const emit = defineEmits(['row-click'])

const { trackEvent } = useAnalytics()
const { getStatusSeverity } = useStatusSeverity()

const pageRows = ref(10)

// This component sorts; the DataTable does not. Binding it to pre-sorted rows
// is what lets date+time act as an implicit secondary key under whatever
// column the user picked -- PrimeVue's single-sort would just re-sort the
// whole set by the clicked field and scramble dates within each group. The one
// sorted array feeds both the table and the mobile cards -- though the table
// still nudges empty values on its own, which is why compareField() below
// carries a matching null rule.
const DATE_SORT_FIELD = 'serviceDate'

// Which column the user clicked. Starts on the date column so the initial view
// is unchanged: soonest first, per the sortOrder prop.
const sortField = ref(DATE_SORT_FIELD)
const sortOrderRef = ref(props.sortOrder)

// PrimeVue still renders the sort icons and toggles direction on header
// clicks, so let it hold its own sort state and just mirror it here.
const onSort = (event) => {
  sortField.value = event.sortField ?? DATE_SORT_FIELD
  sortOrderRef.value = event.sortOrder ?? 1
}

// Bound to the DataTable's sortField, which is documented as accepting either a
// field name or a getter function. A getter returning a constant makes every row
// compare equal, so PrimeVue's sort collapses to a stable no-op (ES2019) that
// preserves the order computed below -- the supported way to keep its sort UI
// while owning the ordering, since PrimeVue has no client-side equivalent of
// "manual sorting". Passing null instead would disable sorting entirely -- and
// take the header sort icons with it, since they key off the same sortField.
const noopSortField = () => 0

const compareDateTime = (a, b) =>
  serviceDateTimeSortKey(a).localeCompare(serviceDateTimeSortKey(b))

// Nullish values sort last regardless of direction -- an unassigned volunteer
// belongs at the bottom whichever way the column is pointed, so this runs
// before the direction multiplier is applied. This is NOT redundant with the
// DataTable: PrimeVue's sort() substitutes nullSortOrder whenever either side
// is empty, so the table relocates empty values on its own. Without this guard
// the cards keep them mid-list and the two views disagree.
const compareField = (field, dir) => (a, b) => {
  const av = a?.[field]
  const bv = b?.[field]
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  const result = typeof av === 'number' && typeof bv === 'number'
    ? av - bv
    : String(av).localeCompare(String(bv))
  return dir * result
}

const sortedRows = computed(() => {
  const field = sortField.value
  const dir = sortOrderRef.value || 1

  // Sorting by date means date+time IS the primary key; there is no separate
  // tiebreak to append.
  if (field === DATE_SORT_FIELD) {
    return [...props.rows].sort((a, b) => dir * compareDateTime(a, b))
  }

  // Otherwise: date+time pass first, then a stable sort by the chosen column.
  // Array.prototype.sort is required to be stable (ES2019+), so rows tying on
  // the chosen column keep the date order established by the first pass. The
  // appended key stays ascending even when the primary is descending -- within
  // one member or village, dates should still read earliest-first.
  return [...props.rows]
    .sort(compareDateTime)
    .sort(compareField(field, dir))
})

const rowClass = computed(() => {
  const id = props.flashRowId
  return (row) => String(row.serviceRequestId) === String(id) ? 'row-flash' : null
})

</script>

<template>
  <div>
    <div v-if="isLoading && !hasLoadedOnce" class="loading-state">
      <p>Loading service requests...</p>
    </div>
    <div v-else-if="error && !hasLoadedOnce" class="error-state">
      <p>Unable to load service requests. Please try again.</p>
    </div>
    <div v-else-if="!rows.length" class="empty-state">
      <p>No service requests found</p>
    </div>

    <DataTable
      v-else
      :value="sortedRows"
      row-hover
      paginator
      :rows="pageRows"
      :sort-field="noopSortField"
      :sort-order="sortOrderRef"
      @sort="onSort"
      class="request-table-responsive desktop-only"
      :row-class="rowClass"
      :pt="{
        tableContainer: { style: 'overflow: visible;' },
        thead: { style: 'top: var(--breadcrumb-height); z-index: 1;' },
        headerRow: { style: 'background: var(--color-background-light);' },
        bodyRow: { style: { cursor: 'pointer' } }
      }"
      @row-click="(event) => emit('row-click', event)"
      @filter="trackEvent('filter_applied')"
    >
      <template #paginatorcontainer="{ first, last, page, pageCount, prevPageCallback, nextPageCallback, totalRecords }">
        <div class="paginator-container">
          <Button icon="pi pi-chevron-left" text rounded @click="prevPageCallback" :disabled="page === 0" />
          <span class="paginator-info">{{ first }}–{{ last }} of {{ totalRecords }}</span>
          <Button icon="pi pi-chevron-right" text rounded @click="nextPageCallback" :disabled="page === pageCount - 1" />
          <Select v-model="pageRows" :options="[10, 25, 50, 100]" />
          <slot name="paginator-extra" />
        </div>
      </template>

      <Column field="serviceDate" header="Date" sortable style="width: 17%">
        <template #body="slotProps">
          {{ formatServiceDate(slotProps.data.serviceDate, { weekday: true }) || '—' }}
        </template>
      </Column>
      <Column v-if="showVillageColumn" field="villageName" header="Village" sortable style="width: 12%"></Column>
      <Column field="serviceName" header="Service" sortable style="width: 18%"></Column>
      <Column field="status" header="Status" sortable headerClass="text-center" style="width: 12%;">
        <template #body="slotProps">
          <Tag :value="slotProps.data.status" :severity="getStatusSeverity(slotProps.data.status)" />
        </template>
      </Column>
      <Column field="memberFullName" header="Member" sortable style="width: 15%"></Column>
      <Column field="volunteerFullName" header="Volunteer" sortable style="width: 15%"></Column>
      <Column field="city" header="Destination" sortable style="width: 13%"></Column>
      <Column field="displayNumber" header="#" sortable style="width: 6%;">
          
        <template #body="slotProps">{{ slotProps.data.displayNumber ?? '—' }}</template>
      </Column>
      <Column header="Actions" style="width: 10%">
        <template #body="slotProps">
          <div class="row-actions">
            <slot name="actions" :data="slotProps.data" />
          </div>
        </template>
      </Column>
    </DataTable>

    <div class="request-cards mobile-only">
      <div
        v-for="request in sortedRows"
        :key="request.serviceRequestId"
        class="request-card"
        :class="{ 'row-flash': String(request.serviceRequestId) === String(flashRowId) }"
        @click="emit('row-click', { data: request })"
      >
        <div class="card-header">
          <h3>{{ request.serviceName ?? 'Service Request' }}</h3>
          <span class="status-badge" :data-status="request.status">{{ request.status ?? '—' }}</span>
        </div>
        <div class="card-row"><span class="label">#:</span><span>{{ request.displayNumber ?? '—' }}</span></div>
        <div class="card-row"><span class="label">Member:</span><span>{{ request.memberFullName ?? '—' }}</span></div>
        <div class="card-row"><span class="label">Volunteer:</span><span>{{ request.volunteerFullName ?? '—' }}</span></div>
        <div class="card-row"><span class="label">Start:</span><span>{{ formatServiceDate(request.serviceDate, { weekday: true }) || '—' }}</span></div>
        <div class="card-row"><span class="label">City:</span><span>{{ request.city ?? '—' }}</span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading-state, .error-state, .empty-state { padding: 2rem; text-align: center; color: var(--color-text-dim); }
.request-table-responsive { width: 100%; cursor: pointer; box-shadow: var(--box-shadow-card); border: 1px solid var(--color-border-default); }
.row-actions { display: flex; gap: 0.25rem; }
.request-cards { display: flex; flex-direction: column; gap: 1rem; }
.request-card { background: var(--color-background-light); border: 1px solid var(--color-border-default); border-radius: 8px; padding: 1rem; cursor: pointer; transition: box-shadow 0.2s ease; }
.request-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; }
.card-header h3 { margin: 0; font-size: 1rem; color: var(--color-text-primary); }
.status-badge { font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; background: var(--color-background-subtle); }
.card-row { display: flex; gap: 0.5rem; font-size: 0.9rem; padding: 0.2rem 0; }
.card-row .label { font-weight: 500; color: var(--color-text-dim); min-width: 80px; }
.text-center { text-align: center; }
.desktop-only { display: table; }
.mobile-only { display: none; }
  :deep(.p-datatable-tbody > tr > td) { padding: 0.4rem 0.75rem; }
  :deep(.p-datatable-thead > tr > th) { padding: 0.4rem 0.75rem; }
  :deep(tr.row-flash td) { animation: row-flash-anim 2s ease-out; }
@media (max-width: 768px) {
  .desktop-only { display: none; }
  .mobile-only { display: flex; }
}
</style>
