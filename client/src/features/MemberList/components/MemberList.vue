<script setup>
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useDebouncedRef } from '../../../shared/composables/useDebouncedRef.js'
import { getVillageMembers } from '../api/memberApi.js'

const router = useRouter()
const route = useRoute()

const villageId = computed(() => route.params.villageId)
const searchText = useDebouncedRef('', 300)
const sortField = ref('fullName')
const sortDir = ref('asc')

const { state: members, isLoading, error } = useAsyncState(
  () => getVillageMembers(villageId.value),
  { immediate: true }
)

const filteredMembers = computed(() => {
  if (!Array.isArray(members.value)) return []

  let result = members.value.filter(m =>
    m.fullName?.toLowerCase().includes(searchText.value.toLowerCase())
  )

  result.sort((a, b) => {
    const aVal = a[sortField.value] ?? ''
    const bVal = b[sortField.value] ?? ''
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDir.value === 'asc' ? cmp : -cmp
  })

  return result
})

const isEmpty = computed(() => !isLoading.value && filteredMembers.value.length === 0)

const toggleSort = (field) => {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = 'asc'
  }
}

const navigateToMember = (personId, fullName) => {
  router.push({
    name: 'member-detail',
    params: { villageId: villageId.value, personId, personName: fullName }
  })
}
</script>

<template>
  <div class="member-list">
    <h1>Members</h1>

    <div class="filter-section">
      <input
        v-model="searchText"
        type="text"
        placeholder="Search by name..."
        class="search-input"
      />
    </div>

    <div v-if="isLoading" class="loading-state">
      <p>Loading members...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>Unable to load members. Please try again.</p>
    </div>

    <div v-else-if="isEmpty" class="empty-state">
      <p>No members found</p>
    </div>

    <!-- Desktop Table -->
    <table v-else class="member-table desktop-only">
      <thead>
        <tr>
          <th @click="toggleSort('fullName')" class="sortable">
            Name
            <span v-if="sortField === 'fullName'" class="sort-indicator">
              {{ sortDir === 'asc' ? '▲' : '▼' }}
            </span>
          </th>
          <th @click="toggleSort('memberNumber')" class="sortable">
            Member #
            <span v-if="sortField === 'memberNumber'" class="sort-indicator">
              {{ sortDir === 'asc' ? '▲' : '▼' }}
            </span>
          </th>
          <th @click="toggleSort('memberLevel')" class="sortable">
            Level
            <span v-if="sortField === 'memberLevel'" class="sort-indicator">
              {{ sortDir === 'asc' ? '▲' : '▼' }}
            </span>
          </th>
          <th @click="toggleSort('joinDate')" class="sortable">
            Join Date
            <span v-if="sortField === 'joinDate'" class="sort-indicator">
              {{ sortDir === 'asc' ? '▲' : '▼' }}
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="member in filteredMembers"
          :key="member.memberId"
          class="clickable"
          @click="navigateToMember(member.personId, member.fullName)"
        >
          <td>{{ member.fullName }}</td>
          <td>{{ member.memberNumber ?? '—' }}</td>
          <td>{{ member.memberLevel ?? '—' }}</td>
          <td>{{ member.joinDate ?? '—' }}</td>
        </tr>
      </tbody>
    </table>

    <!-- Mobile Card List -->
    <div class="member-cards mobile-only">
      <div
        v-for="member in filteredMembers"
        :key="member.memberId"
        class="member-card"
        @click="navigateToMember(member.personId, member.fullName)"
      >
        <h3>{{ member.fullName }}</h3>
        <div class="card-row">
          <span class="label">Member #:</span>
          <span>{{ member.memberNumber ?? '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">Level:</span>
          <span>{{ member.memberLevel ?? '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">Joined:</span>
          <span>{{ member.joinDate ?? '—' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.member-list {
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

/* Desktop Table */
.member-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  overflow: hidden;
}

.member-table thead {
  background-color: var(--color-background-dark);
}

.member-table th {
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-default);
}

.member-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.member-table th.sortable:hover {
  background-color: var(--color-background-subtle);
}

.sort-indicator {
  margin-left: 0.5rem;
  font-size: 0.75rem;
  opacity: 0.7;
}

.member-table td {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
}

.member-table tbody tr.clickable {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.member-table tbody tr.clickable:hover {
  background-color: var(--color-background-subtle);
}

/* Mobile Card List */
.member-cards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.member-card {
  padding: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.member-card:active {
  background-color: var(--color-background-subtle);
}

.member-card h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  color: var(--color-text-primary);
}

.card-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.card-row .label {
  color: var(--color-text-dim);
}

/* Responsive */
.desktop-only {
  display: table;
}

.mobile-only {
  display: none;
}

@media (max-width: 768px) {
  .member-list {
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
