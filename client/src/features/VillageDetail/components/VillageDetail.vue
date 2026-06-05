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

const capabilityCountsChartData = computed(() => {
  if (!village.value?.capabilityCounts) {
    return null
  }

  const capabilityCounts = village.value.capabilityCounts
  const sortedKeys = Object.keys(capabilityCounts).sort()
  const labels = sortedKeys.map(key => camelCaseToTitleCase(key))
  const data = sortedKeys.map(key => capabilityCounts[key])

  return {
    labels,
    datasets: [
      {
        label: 'Volunteers',
        backgroundColor: '#10B981',
        borderColor: '#047857',
        borderWidth: 1,
        data
      }
    ]
  }
})

const capabilityChartOptions = {
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
          return `${context.dataset.label}: ${context.parsed.y}`
        }
      }
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        stepSize: 1
      }
    }
  }
}

const camelCaseToTitleCase = (str) => {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim()
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

    <div class="charts-section">
      <div v-if="personCountsChartData" class="chart-container">
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

      <div v-if="capabilityCountsChartData" class="chart-container">
        <h2>Volunteers by Capability</h2>
        <Chart
          type="bar"
          :data="capabilityCountsChartData"
          :options="capabilityChartOptions"
        />
        <div class="chart-summary">
          <div class="summary-column">
            <div class="summary-row">
              <span class="summary-label">{{ camelCaseToTitleCase('errands') }}:</span>
              <span class="summary-value">{{ village.capabilityCounts.errands }}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">{{ camelCaseToTitleCase('friends') }}:</span>
              <span class="summary-value">{{ village.capabilityCounts.friends }}</span>
            </div>
          </div>
          <div class="summary-column">
            <div class="summary-row">
              <span class="summary-label">{{ camelCaseToTitleCase('homeHelp') }}:</span>
              <span class="summary-value">{{ village.capabilityCounts.homeHelp }}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">{{ camelCaseToTitleCase('rides') }}:</span>
              <span class="summary-value">{{ village.capabilityCounts.rides }}</span>
            </div>
          </div>
          <div class="summary-column">
            <div class="summary-row">
              <span class="summary-label">{{ camelCaseToTitleCase('techSupport') }}:</span>
              <span class="summary-value">{{ village.capabilityCounts.techSupport }}</span>
            </div>
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
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.summary-column {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.summary-row {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 1rem;
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
