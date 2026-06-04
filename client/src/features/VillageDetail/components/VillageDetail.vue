<script setup>
import { computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useElevate } from '../../../shared/composables/useElevate.js'
import { getVillage } from '../api/villageApi.js'

const router = useRouter()
const route = useRoute()
const { elevateEnabled } = useElevate()

const villageId = computed(() => route.params.villageId)

const { state: village, execute } = useAsyncState(
  () => getVillage(villageId.value),
  { immediate: true }
)

// Refetch when elevate is toggled
watch(elevateEnabled, () => {
  execute()
})

const navigateTo = (section) => {
  router.push({
    name: section,
    params: { villageId: villageId.value }
  })
}
</script>

<template>
  <div class="village-detail">
    <h1>{{ village?.name ?? 'Village' }}</h1>

    <div class="nav-section">
      <button class="nav-btn" @click="navigateTo('members')">
        Members
      </button>
      <button class="nav-btn" @click="navigateTo('volunteers')">
        Volunteers
      </button>
      <button class="nav-btn" @click="navigateTo('service-requests')">
        Service Requests
      </button>
    </div>
  </div>
</template>

<style scoped>
.village-detail {
  padding: 2rem;
}

h1 {
  margin: 1rem 0 2rem 0;
  color: var(--color-text-primary);
}

.nav-section {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.nav-btn {
  padding: 0.75rem 1.5rem;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  transition: background-color 0.2s ease;
}

.nav-btn:hover {
  background-color: var(--color-primary-hover);
}

@media (max-width: 768px) {
  .village-detail {
    padding: 1rem;
  }

  .nav-section {
    flex-direction: column;
  }

  .nav-btn {
    width: 100%;
  }
}
</style>
