<script setup>
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import Card from 'primevue/card'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useElevate } from '../../../shared/composables/useElevate.js'
import { getVillages } from '../api/villageApi.js'

const router = useRouter()
const { elevateEnabled, elevate } = useElevate()

const { state: villages, isLoading, error, execute } = useAsyncState(
  () => getVillages(elevate.value),
  { immediate: true }
)

// Refetch when elevate is toggled
watch(elevateEnabled, () => {
  execute()
})

const isEmpty = computed(() => !isLoading.value && Array.isArray(villages.value) && villages.value.length === 0)

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
        <template #title>{{ village.name }}</template>
        <template #content v-if="village.personCounts" class="card-stats">
          <div class="stat">
            <span class="label">Members:</span>
            <span class="value">{{ village.personCounts.member ?? 0 }}</span>
          </div>
          <div class="stat">
            <span class="label">Volunteers:</span>
            <span class="value">{{ village.personCounts.volunteer ?? 0 }}</span>
          </div>
          <div class="stat">
            <span class="label">Both:</span>
            <span class="value">{{ village.personCounts.both ?? 0 }}</span>
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
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
}

.village-card {
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid var(--color-border-default);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.village-card:hover {
  transform: translateY(-2px);
}

.card-stats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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
