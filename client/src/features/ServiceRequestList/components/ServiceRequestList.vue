<script setup>
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useDebouncedRef } from '../../../shared/composables/useDebouncedRef.js'
import { getVillageServiceRequests } from '../api/serviceRequestApi.js'

const router = useRouter()
const route = useRoute()

const villageId = computed(() => route.params.villageId)
const searchText = useDebouncedRef('', 300)
const selectedStatuses = ref([])
const sortField = ref('requestNumber')
const sortDir = ref('asc')

const { state: requests, isLoading, error, execute } = useAsyncState(
  () => getVillageServiceRequests(villageId.value, selectedStatuses.value),
  { immediate: true }
)

const statusOptions = ['open', 'confirmed', 'completed', 'unmatched', 'cancelled']

const filteredRequests = computed(() => {
  if (!Array.isArray(requests.value)) return []

  let result = requests.value.filter(r =>
    r.serviceName?.toLowerCase().includes(searchText.value.toLowerCase())
  )

  result.sort((a, b) => {
    const aVal = a[sortField.value] ?? ''
    const bVal = b[sortField.value] ?? ''
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDir.value === 'asc' ? cmp : -cmp
  })

  return result
})

const isEmpty = computed(() => !isLoading.value && filteredRequests.value.length === 0)

const toggleSort = (field) => {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = 'asc'
  }
}

const toggleStatus = (status) => {
  const idx = selectedStatuses.value.indexOf(status)
  if (idx >= 0) {
    selectedStatuses.value.splice(idx, 1)
  } else {
    selectedStatuses.value.push(status)
  }
  execute()
}

const navigateToRequest = (serviceRequestId) => {
  router.push({
    name: 'service-request-detail',
    params: { villageId: villageId.value, id: serviceRequestId }
  })
}
</script>

<template>
  <div class="service-request-list">
    <h1>Service Requests</h1>

    <div class="filter-section">
      <div class="search-box">
        <input
          v-model="searchText"
          type="text"
          placeholder="Search by service name..."
          class="search-input"
        />
      </div>

      <div class="status-filters">
        <div
          v-for="status in statusOptions"
          :key="status"
          class="status-filter"
        >
          <input
            :id="`status-${status}`"
            type="checkbox"
            :checked="selectedStatuses.includes(status)"
            @change="toggleStatus(status)"
          />
          <label :for="`status-${status}`">{{ status }}</label>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <p>Loading service requests...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>Unable to load service requests. Please try again.</p>
    </div>

    <div v-else-if="isEmpty" class="empty-state">
      <p>No service requests found</p>
    </div>

    <!-- Desktop Table -->
    <table v-else class="request-table desktop-only">
      <thead>
        <tr>
          <th @click="toggleSort('requestNumber')" class="sortable">
            #
            <span v-if="sortField === 'requestNumber'" class="sort-indicator">
              {{ sortDir === 'asc' ? '▲' : '▼' }}
            </span>
          </th>
          <th @click="toggleSort('serviceName')" class="sortable">
            Service
            <span v-if="sortField === 'serviceName'" class="sort-indicator">
              {{ sortDir === 'asc' ? '▲' : '▼' }}
            </span>
          </th>
          <th @click="toggleSort('status')" class="sortable">
            Status
            <span v-if="sortField === 'status'" class="sort-indicator">
              {{ sortDir === 'asc' ? '▲' : '▼' }}
            </span>
          </th>
          <th>Member</th>
          <th>Volunteer</th>
          <th @click="toggleSort('startAt')" class="sortable">
            Start
            <span v-if="sortField === 'startAt'" class="sort-indicator">
              {{ sortDir === 'asc' ? '▲' : '▼' }}
            </span>
          </th>
          <th>City</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="request in filteredRequests"
          :key="request.serviceRequestId"
          class="clickable"
          @click="navigateToRequest(request.serviceRequestId)"
        >
          <td>{{ request.requestNumber ?? '—' }}</td>
          <td>{{ request.serviceName ?? '—' }}</td>
          <td>
            <span class="status-badge" :data-status="request.status">
              {{ request.status ?? '—' }}
            </span>
          </td>
          <td>{{ request.memberFullName ?? '—' }}</td>
          <td>{{ request.volunteerFullName ?? '—' }}</td>
          <td>{{ request.startAt ? formatDate(request.startAt) : '—' }}</td>
          <td>{{ request.city ?? '—' }}</td>
        </tr>
      </tbody>
    </table>

    <!-- Mobile Card List -->
    <div class="request-cards mobile-only">
      <div
        v-for="request in filteredRequests"
        :key="request.serviceRequestId"
        class="request-card"
        @click="navigateToRequest(request.serviceRequestId)"
      >
        <div class="card-header">
          <h3>{{ request.serviceName ?? 'Service Request' }}</h3>
          <span class="status-badge" :data-status="request.status">
            {{ request.status ?? '—' }}
          </span>
        </div>
        <div class="card-row">
          <span class="label">#:</span>
          <span>{{ request.requestNumber ?? '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">Member:</span>
          <span>{{ request.memberFullName ?? '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">Volunteer:</span>
          <span>{{ request.volunteerFullName ?? '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">Start:</span>
          <span>{{ request.startAt ? formatDate(request.startAt) : '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">City:</span>
          <span>{{ request.city ?? '—' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
function formatDate(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString()
}
</script>

<style scoped>
.service-request-list {
  padding: 2rem;
}

h1 {
  margin: 1rem 0 1.5rem 0;
  color: var(--color-text-primary);
}

.filter-section {
  margin-bottom: 1.5rem;
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  align-items: flex-start;
}

.search-box {
  flex: 1;
  min-width: 250px;
}

.search-input {
  width: 100%;
  padding: 0.75rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.search-input:focus {
  outline: none;
  border-color: var(--color-primary-highlight-light);
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.1);
}

.status-filters {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.status-filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-filter input[type="checkbox"] {
  cursor: pointer;
}

.status-filter label {
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--color-text-primary);
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-dim);
  font-style: italic;
}

.error-state {
  color: var(--color-text-error);
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  white-space: nowrap;
}

.status-badge[data-status="open"] {
  background-color: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.status-badge[data-status="confirmed"] {
  background-color: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.status-badge[data-status="completed"] {
  background-color: rgba(147, 51, 234, 0.15);
  color: #d8b4fe;
}

.status-badge[data-status="unmatched"] {
  background-color: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}

.status-badge[data-status="cancelled"] {
  background-color: rgba(107, 114, 128, 0.15);
  color: #d1d5db;
}

/* Desktop Table */
.request-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  overflow: hidden;
  font-size: 0.9rem;
}

.request-table thead {
  background-color: var(--color-background-dark);
}

.request-table th {
  padding: 0.75rem;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-default);
}

.request-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.request-table th.sortable:hover {
  background-color: var(--color-background-subtle);
}

.sort-indicator {
  margin-left: 0.3rem;
  font-size: 0.65rem;
  opacity: 0.7;
}

.request-table td {
  padding: 0.75rem;
  border-bottom: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
}

.request-table tbody tr.clickable {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.request-table tbody tr.clickable:hover {
  background-color: var(--color-background-subtle);
}

/* Mobile Card List */
.request-cards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
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

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.75rem;
  gap: 0.5rem;
}

.card-header h3 {
  margin: 0;
  font-size: 1rem;
  color: var(--color-text-primary);
  flex: 1;
}

.card-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
}

.card-row .label {
  color: var(--color-text-dim);
  font-weight: 500;
}

/* Responsive */
.desktop-only {
  display: table;
}

.mobile-only {
  display: none;
}

@media (max-width: 768px) {
  .service-request-list {
    padding: 1rem;
  }

  .filter-section {
    flex-direction: column;
    gap: 1rem;
  }

  .search-box {
    min-width: auto;
  }

  .status-filters {
    flex-direction: column;
  }

  .status-filter {
    width: 100%;
  }

  .desktop-only {
    display: none;
  }

  .mobile-only {
    display: flex;
  }
}
</style>
