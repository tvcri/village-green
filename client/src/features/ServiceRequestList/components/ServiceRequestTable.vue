<script setup>
import { ref } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import Select from 'primevue/select'
import { useAnalytics } from '../../../shared/composables/useAnalytics.js'

defineOptions({ name: 'ServiceRequestTable' })

const props = defineProps({
  rows: { type: Array, required: true },
  isLoading: { type: Boolean, required: true },
  hasLoadedOnce: { type: Boolean, required: true },
  error: { required: true },
  showVillageColumn: { type: Boolean, default: false }
})

const emit = defineEmits(['row-click'])

const { trackEvent } = useAnalytics()

const pageRows = ref(12)

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString()
}

function getStatusSeverity(status) {
  const s = status?.toLowerCase() || ''
  if (s.includes('cancelled')) return 'danger'
  switch (s) {
    case 'open': return 'warn'
    case 'confirmed': return 'info'
    case 'completed': return 'success'
    case 'unmatched': return 'secondary'
    default: return 'info'
  }
}
</script>

<template>
  <div>
    <slot name="header-actions" />

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
      :value="rows"
      paginator
      paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
      :rows="pageRows"
      sort-field="startAt"
      :sort-order="1"
      class="request-table-responsive desktop-only"
      :pt="{ tableContainer: { style: 'overflow: visible;' }, thead: { style: 'top: var(--breadcrumb-height); z-index: 1;' }, headerRow: { style: 'background: var(--color-background-light);' } }"
      @row-click="(event) => emit('row-click', event)"
      @filter="trackEvent('filter_applied')"
    >
      <template #paginatorcontainer="{ first, last, page, pageCount, prevPageCallback, nextPageCallback, totalRecords }">
        <div class="paginator-container">
          <Button icon="pi pi-chevron-left" text rounded @click="prevPageCallback" :disabled="page === 0" />
          <span class="paginator-info">{{ first }}–{{ last }} of {{ totalRecords }}</span>
          <Button icon="pi pi-chevron-right" text rounded @click="nextPageCallback" :disabled="page === pageCount - 1" />
          <Select v-model="pageRows" :options="[12, 25, 50, 100]" />
        </div>
      </template>

      <Column field="startAt" header="Date" sortable style="width: 12%">
        <template #body="slotProps">
          {{ slotProps.data.startAt ? formatDate(slotProps.data.startAt) : '—' }}
        </template>
      </Column>
      <Column v-if="showVillageColumn" field="villageName" header="Village" sortable style="width: 15%"></Column>
      <Column field="serviceName" header="Service" sortable style="width: 20%"></Column>
      <Column field="status" header="Status" sortable style="width: 12%">
        <template #body="slotProps">
          <Tag :value="slotProps.data.status" :severity="getStatusSeverity(slotProps.data.status)" />
        </template>
      </Column>
      <Column field="memberFullName" header="Member" sortable style="width: 15%"></Column>
      <Column field="volunteerFullName" header="Volunteer" sortable style="width: 15%"></Column>
      <Column field="city" header="City" sortable style="width: 13%"></Column>
      <Column field="displayNumber" header="#" sortable style="width: 10%">
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
        v-for="request in rows"
        :key="request.serviceRequestId"
        class="request-card"
        @click="emit('row-click', { data: request })"
      >
        <div class="card-header">
          <h3>{{ request.serviceName ?? 'Service Request' }}</h3>
          <span class="status-badge" :data-status="request.status">{{ request.status ?? '—' }}</span>
        </div>
        <div class="card-row"><span class="label">#:</span><span>{{ request.displayNumber ?? '—' }}</span></div>
        <div class="card-row"><span class="label">Member:</span><span>{{ request.memberFullName ?? '—' }}</span></div>
        <div class="card-row"><span class="label">Volunteer:</span><span>{{ request.volunteerFullName ?? '—' }}</span></div>
        <div class="card-row"><span class="label">Start:</span><span>{{ request.startAt ? formatDate(request.startAt) : '—' }}</span></div>
        <div class="card-row"><span class="label">City:</span><span>{{ request.city ?? '—' }}</span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading-state, .error-state, .empty-state { padding: 2rem; text-align: center; color: var(--color-text-dim); }
.request-table-responsive { width: 100%; cursor: pointer; }
.paginator-container { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; }
.paginator-info { font-size: 0.9rem; color: var(--color-text-dim); min-width: 100px; text-align: center; }
.row-actions { display: flex; gap: 0.25rem; }
.request-cards { display: flex; flex-direction: column; gap: 1rem; }
.request-card { background: var(--color-background-light); border: 1px solid var(--color-border-default); border-radius: 8px; padding: 1rem; cursor: pointer; transition: box-shadow 0.2s ease; }
.request-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; }
.card-header h3 { margin: 0; font-size: 1rem; color: var(--color-text-primary); }
.status-badge { font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; background: var(--color-background-subtle); }
.card-row { display: flex; gap: 0.5rem; font-size: 0.9rem; padding: 0.2rem 0; }
.card-row .label { font-weight: 500; color: var(--color-text-dim); min-width: 80px; }
.desktop-only { display: table; }
.mobile-only { display: none; }
@media (max-width: 768px) {
  .desktop-only { display: none; }
  .mobile-only { display: flex; }
}
</style>
