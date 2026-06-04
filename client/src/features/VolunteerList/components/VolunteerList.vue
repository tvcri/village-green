<script setup>
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useDebouncedRef } from '../../../shared/composables/useDebouncedRef.js'
import { getVillageVolunteers } from '../api/volunteerApi.js'

const router = useRouter()
const route = useRoute()

const villageId = computed(() => route.params.villageId)
const searchText = useDebouncedRef('', 300)
const sortField = ref('fullName')
const sortDir = ref('asc')

const { state: volunteers, isLoading, error } = useAsyncState(
  () => getVillageVolunteers(villageId.value),
  { immediate: true }
)

const filteredVolunteers = computed(() => {
  if (!Array.isArray(volunteers.value)) return []

  let result = volunteers.value.filter(v =>
    v.fullName?.toLowerCase().includes(searchText.value.toLowerCase())
  )

  result.sort((a, b) => {
    const aVal = a[sortField.value] ?? ''
    const bVal = b[sortField.value] ?? ''
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDir.value === 'asc' ? cmp : -cmp
  })

  return result
})

const isEmpty = computed(() => !isLoading.value && filteredVolunteers.value.length === 0)

const toggleSort = (field) => {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = 'asc'
  }
}

const navigateToVolunteer = (personId, fullName) => {
  router.push({
    name: 'volunteer-detail',
    params: { villageId: villageId.value, personId, personName: fullName }
  })
}
</script>

<template>
  <div class="volunteer-list">
    <h1>Volunteers</h1>

    <div class="filter-section">
      <input
        v-model="searchText"
        type="text"
        placeholder="Search by name..."
        class="search-input"
      />
    </div>

    <div v-if="isLoading" class="loading-state">
      <p>Loading volunteers...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>Unable to load volunteers. Please try again.</p>
    </div>

    <div v-else-if="isEmpty" class="empty-state">
      <p>No volunteers found</p>
    </div>

    <!-- Desktop Table -->
    <table v-else class="volunteer-table desktop-only">
      <thead>
        <tr>
          <th @click="toggleSort('fullName')" class="sortable">
            Name
            <span v-if="sortField === 'fullName'" class="sort-indicator">
              {{ sortDir === 'asc' ? '▲' : '▼' }}
            </span>
          </th>
          <th>Capabilities</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="volunteer in filteredVolunteers"
          :key="volunteer.volunteerId"
          class="clickable"
          @click="navigateToVolunteer(volunteer.personId, volunteer.fullName)"
        >
          <td>{{ volunteer.fullName }}</td>
          <td>
            <div class="capabilities-list">
              <span
                v-for="cap in volunteer.capabilities"
                :key="cap"
                class="capability-badge"
              >
                {{ cap }}
              </span>
              <span v-if="!volunteer.capabilities?.length" class="no-capabilities">
                —
              </span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Mobile Card List -->
    <div class="volunteer-cards mobile-only">
      <div
        v-for="volunteer in filteredVolunteers"
        :key="volunteer.volunteerId"
        class="volunteer-card"
        @click="navigateToVolunteer(volunteer.personId, volunteer.fullName)"
      >
        <h3>{{ volunteer.fullName }}</h3>
        <div class="card-row">
          <span class="label">Capabilities:</span>
          <div v-if="volunteer.capabilities?.length" class="capabilities-list">
            <span
              v-for="cap in volunteer.capabilities"
              :key="cap"
              class="capability-badge"
            >
              {{ cap }}
            </span>
          </div>
          <span v-else class="no-capabilities">None listed</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.volunteer-list {
  padding: 2rem;
}

h1 {
  margin: 1rem 0 1.5rem 0;
  color: var(--color-text-primary);
}

.filter-section {
  margin-bottom: 1.5rem;
}

.search-input {
  width: 100%;
  max-width: 400px;
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

/* Capabilities Badge */
.capabilities-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.capability-badge {
  display: inline-block;
  padding: 0.3rem 0.6rem;
  background-color: var(--color-background-dark);
  border: 1px solid var(--color-border-default);
  border-radius: 3px;
  font-size: 0.8rem;
  color: var(--color-text-dim);
}

.no-capabilities {
  color: var(--color-text-dim);
  font-style: italic;
}

/* Desktop Table */
.volunteer-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  overflow: hidden;
}

.volunteer-table thead {
  background-color: var(--color-background-dark);
}

.volunteer-table th {
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-default);
}

.volunteer-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.volunteer-table th.sortable:hover {
  background-color: var(--color-background-subtle);
}

.sort-indicator {
  margin-left: 0.5rem;
  font-size: 0.75rem;
  opacity: 0.7;
}

.volunteer-table td {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
}

.volunteer-table tbody tr.clickable {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.volunteer-table tbody tr.clickable:hover {
  background-color: var(--color-background-subtle);
}

/* Mobile Card List */
.volunteer-cards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.volunteer-card {
  padding: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.volunteer-card:active {
  background-color: var(--color-background-subtle);
}

.volunteer-card h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  color: var(--color-text-primary);
}

.card-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.card-row .label {
  color: var(--color-text-dim);
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
}

/* Responsive */
.desktop-only {
  display: table;
}

.mobile-only {
  display: none;
}

@media (max-width: 768px) {
  .volunteer-list {
    padding: 1rem;
  }

  .search-input {
    max-width: 100%;
  }

  .desktop-only {
    display: none;
  }

  .mobile-only {
    display: flex;
  }
}
</style>
