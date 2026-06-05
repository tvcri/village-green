<script setup>
import { computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Button from 'primevue/button'
import Chart from 'primevue/chart'
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

const personCountsChartData = computed(() => {
  if (!village.value?.personCounts) {
    return null
  }

  const { member, volunteer, both } = village.value.personCounts

  return {
    labels: ['Members Only', 'Volunteers Only', 'Both Roles'],
    datasets: [
      {
        data: [member, volunteer, both],
        backgroundColor: [
          '#3B82F6',
          '#10B981',
          '#F59E0B'
        ],
        hoverBackgroundColor: [
          '#1E40AF',
          '#047857',
          '#D97706'
        ],
        borderColor: '#1F2937',
        borderWidth: 2
      }
    ]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: true,
  aspectRatio: 1.5,
  plugins: {
    legend: {
      position: 'top'
    },
    tooltip: {
      callbacks: {
        label: (context) => {
          const label = context.label || ''
          const value = context.parsed || 0
          return `${label}: ${value}`
        }
      }
    }
  }
}

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

    <div v-if="personCountsChartData" class="charts-section">
      <div class="chart-container">
        <h2>Person Counts by Role</h2>
        <Chart
          type="pie"
          :data="personCountsChartData"
          :options="chartOptions"
        />
        <div class="chart-summary">
          <div class="summary-row">
            <span class="summary-label">Members Only:</span>
            <span class="summary-value">{{ village.personCounts.member }}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Volunteers Only:</span>
            <span class="summary-value">{{ village.personCounts.volunteer }}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Both Roles:</span>
            <span class="summary-value">{{ village.personCounts.both }}</span>
          </div>
        </div>
      </div>
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

h2 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  color: var(--color-text-primary);
}

.nav-section {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 2rem;
}

.charts-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 2rem;
  margin-top: 2rem;
}

.chart-container {
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  padding: 1.5rem;
  max-width: 500px;
}

.chart-summary {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--color-border-default);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
}

.summary-label {
  color: var(--color-text-dim);
  font-weight: 500;
}

.summary-value {
  color: var(--color-text-primary);
  font-weight: 600;
}

@media (max-width: 768px) {
  .village-detail {
    padding: 1rem;
  }

  .nav-section {
    flex-direction: column;
  }

  .charts-section {
    grid-template-columns: 1fr;
  }
}
</style>
