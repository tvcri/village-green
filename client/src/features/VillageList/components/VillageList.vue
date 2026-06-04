<script setup>
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useElevate } from '../../../shared/composables/useElevate.js'
import { getVillages } from '../api/villageApi.js'

const router = useRouter()
const { elevateEnabled } = useElevate()

const { state: villages, isLoading, error, execute } = useAsyncState(
  () => getVillages(),
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
      <div
        v-for="village in villages"
        :key="village.villageId"
        class="village-card"
        @click="navigateToVillage(village.villageId)"
      >
        <h2>{{ village.name }}</h2>
        <div v-if="village.personCounts" class="card-stats">
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
        </div>
      </div>
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
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
}

.village-card {
  padding: 1.5rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.village-card:hover {
  background-color: var(--color-background-subtle);
  border-color: var(--color-border-hover);
  transform: translateY(-2px);
}

.village-card h2 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
  color: var(--color-text-primary);
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
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .village-card {
    padding: 1rem;
  }
}
</style>
