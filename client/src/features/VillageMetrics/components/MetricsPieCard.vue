<script setup>
import { computed } from 'vue'
import Chart from 'primevue/chart'

const props = defineProps({
  slices: { type: Array, required: true }, // [{ label, value, color }]
  rows: { type: Array, required: true }, // [{ label, value, color, pct }] — pct is a fraction (0..1)
  emptyMessage: { type: String, required: true },
})

defineOptions({ name: 'MetricsPieCard' })

const hasSlices = computed(() => props.slices.length > 0)

const chartData = computed(() => ({
  labels: props.slices.map(s => s.label),
  datasets: [{
    data: props.slices.map(s => s.value),
    backgroundColor: props.slices.map(s => s.color),
  }],
}))

// Legend plugin is off — the rows table to the right is the legend. Tooltip
// carries label + value + pct since that identity/detail pairing isn't on the chart itself.
const chartOptions = {
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label (context) {
          const value = context.parsed
          const total = context.dataset.data.reduce((sum, v) => sum + v, 0)
          const pct = total > 0 ? Math.round((value / total) * 100) : 0
          return `${context.label}: ${value} (${pct}%)`
        },
      },
    },
  },
}

function formatPct (pct) {
  return `${Math.round(pct * 100)}%`
}
</script>

<template>
  <div class="pie-card">
    <div class="chart-container">
      <Chart v-if="hasSlices" type="pie" :data="chartData" :options="chartOptions" />
      <p v-else class="empty-msg">{{ emptyMessage }}</p>
    </div>
    <div class="legend-table-wrap">
      <table class="legend-table">
        <thead>
          <tr>
            <th class="swatch-col" />
            <th>Label</th>
            <th>Value</th>
            <th>Pct</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.label">
            <td class="swatch-col"><span class="swatch" :style="{ backgroundColor: row.color }" /></td>
            <td>{{ row.label }}</td>
            <td>{{ row.value }}</td>
            <td>{{ formatPct(row.pct) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.pie-card {
  display: flex;
  gap: 1.5rem;
  container-type: inline-size;
}

.chart-container {
  flex: 0 0 280px;
  width: 280px;
  height: 280px;
}

/* Container-owned sizing: if the canvas sizes its own wrapper, Chart.js reads back the
   shrunken size and the chart never re-expands after a viewport shrink (see b02e1ba0). */
.chart-container :deep(.p-chart) { width: 100%; height: 100%; }

.empty-msg {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  margin: 0;
  color: var(--color-text-muted, #6b7280);
  text-align: center;
}

.legend-table-wrap {
  flex: 1 1 auto;
  min-width: 0;
  max-height: 22rem; /* scrolls past ~10 rows instead of stretching the card */
  overflow-y: auto;
}

.legend-table {
  width: 100%;
  border-collapse: collapse;
}

.legend-table th {
  text-align: left;
  color: var(--color-text-muted, #6b7280);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--color-border-default, #e5e7eb);
}

.legend-table td {
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--color-border-default, #e5e7eb);
}

.swatch-col {
  width: 1.5rem;
}

.swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 2px;
}

@container (max-width: 640px) {
  .pie-card {
    flex-direction: column;
  }

  .chart-container {
    width: 100%;
    max-width: 280px;
  }
}
</style>
