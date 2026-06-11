<script setup>
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useElevate } from '../../../shared/composables/useElevate.js'
import { useStatusSeverity } from '../../../shared/composables/useStatusSeverity.js'
import { getVillages } from '../api/villageApi.js'

const router = useRouter()
const { elevateEnabled, elevate } = useElevate()
const { getStatusSeverity } = useStatusSeverity()

const { state: villages, isLoading, error, execute } = useAsyncState(
  () => getVillages(elevate.value, ['personCounts', 'srStatusCounts']),
  { immediate: true }
)

// Refetch when elevate is toggled
watch(elevateEnabled, () => {
  execute()
})

const isEmpty = computed(() => !isLoading.value && Array.isArray(villages.value) && villages.value.length === 0)

const getTotalPersonCount = (village) => {
  const counts = village.personCounts || {}
  return (counts.member ?? 0) + (counts.volunteer ?? 0) + (counts.both ?? 0)
}

const navigateToVillage = (villageId) => {
  router.push({ name: 'village-detail', params: { villageId } })
}
</script>

<template>
  <div class="village-list">
    <h1>Villages</h1>

    <div v-if="isLoading" class="loading-state">
      <p>Loading villages...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>Unable to load villages. Please try again.</p>
    </div>

    <div v-else-if="isEmpty" class="empty-state">
      <p>No villages found</p>
    </div>

    <div v-else class="village-grid">
      <Card
        v-for="village in villages"
        :key="village.villageId"
        class="village-card"
        @click="navigateToVillage(village.villageId)"
      >
        <template #title>
          <div class="title-header">
            <span class="village-name">{{ village.name }}</span>
            <Tag v-if="village.personCounts" icon="pi pi-users" :value="`${getTotalPersonCount(village)}`" severity="secondary" />
          </div>
        </template>
        <template #content class="card-stats">
          <div v-if="village.personCounts" class="people-grid">
            <div class="person-stat">
              <div class="person-label">Members</div>
              <div class="person-value">{{ village.personCounts.member ?? 0 }}</div>
            </div>
            <div class="person-stat">
              <div class="person-label">Volunteers</div>
              <div class="person-value">{{ village.personCounts.volunteer ?? 0 }}</div>
            </div>
            <div class="person-stat">
              <div class="person-label">Both</div>
              <div class="person-value">{{ village.personCounts.both ?? 0 }}</div>
            </div>
          </div>
          <div v-if="village.srStatusCounts" class="sr-grid">
            <div class="sr-stat">
              <Tag value="Open" :severity="getStatusSeverity('open')" class="sr-tag" />
              <div class="sr-value">{{ village.srStatusCounts.open ?? 0 }}</div>
            </div>
            <div class="sr-stat">
              <Tag value="Confirmed" :severity="getStatusSeverity('confirmed')" class="sr-tag" />
              <div class="sr-value">{{ village.srStatusCounts.confirmed ?? 0 }}</div>
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.village-list {
  padding: 2rem;
}

h1 {
  margin-top: 0;
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

.village-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
}

.village-card {
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid var(--color-border-default);
  box-shadow: var(--box-shadow-card);
}

.village-card:hover {
  transform: translateY(-2px);
}

.title-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.village-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.card-stats {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.people-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.person-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.person-label {
  font-size: 0.75rem;
  color: var(--color-text-dim);
  font-weight: 500;
}

.person-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.sr-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.sr-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.sr-tag {
  width: 100%;
}

:deep(.sr-tag.p-tag) {
  font-size: 0.65rem;
  padding: 0.25rem 0.5rem;
  width: 60%;
  text-align: center;
}

:deep(.village-card .p-card-body) {
  padding: 0.5rem 0.75rem;
}

.sr-value {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.stat {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.stat .label {
  color: var(--color-text-dim);
}

.stat .value {
  font-weight: 600;
  color: var(--color-text-bright);
}

/* Mobile responsive */
@media (max-width: 768px) {
  .village-list {
    padding: 1rem;
  }

  .village-grid {
    gap: 1rem;
  }
}
</style>
