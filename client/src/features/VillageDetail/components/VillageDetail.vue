<script setup>
import { computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Button from 'primevue/button'
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
      <Button label="Members" @click="navigateTo('members')" />
      <Button label="Volunteers" @click="navigateTo('volunteers')" />
      <Button label="Service Requests" @click="navigateTo('service-requests')" />
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

@media (max-width: 768px) {
  .village-detail {
    padding: 1rem;
  }

  .nav-section {
    flex-direction: column;
  }
}
</style>
