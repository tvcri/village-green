<script setup>
defineProps({
  stats: {
    type: Object,
    required: true,
    // { villages, requests, completed, cancelled, unmatched }
  },
})

defineOptions({ name: 'MetaSummaryStrip' })

const CARDS = [
  { label: 'Villages', key: 'villages' },
  { label: 'Requests', key: 'requests' },
  { label: 'Completed', key: 'completed' },
  { label: 'Cancelled', key: 'cancelled' },
  { label: 'Unmatched', key: 'unmatched' },
]
</script>

<template>
  <div class="summary-strip">
    <div v-for="card in CARDS" :key="card.key" class="stat-card">
      <label class="stat-label">{{ card.label }}</label>
      <div class="stat-value">{{ stats[card.key].toLocaleString() }}</div>
    </div>
  </div>
</template>

<style scoped>
.summary-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: var(--color-background-light, #fff);
  border: 1px solid var(--color-border-default, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  flex: 1 1 150px;
  /* A flat 150px floor plus the gap overflows a 320px screen once two cards
     share a row; min() keeps the preference but allows collapse. */
  min-width: min(150px, 100%);
}

.stat-label {
  display: block;
  color: var(--color-text-muted, #6b7280);
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.stat-value { font-size: 1.875rem; font-weight: 600; }
</style>
