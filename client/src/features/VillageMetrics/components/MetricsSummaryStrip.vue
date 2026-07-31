<script setup>
defineProps({
  stats: {
    type: Object,
    required: true,
    // { requests, completed, unmatched, cancelled }
  },
})

defineOptions({ name: 'MetricsSummaryStrip' })
</script>

<template>
  <div class="summary-strip">
    <div class="stat-card">
      <label class="stat-label">Requests</label>
      <div class="stat-value">{{ stats.requests }}</div>
    </div>
    <div class="stat-card">
      <label class="stat-label">Completed</label>
      <div class="stat-value">{{ stats.completed }}</div>
    </div>
    <div class="stat-card">
      <label class="stat-label">Cancelled</label>
      <div class="stat-value">{{ stats.cancelled }}</div>
    </div>
    <div class="stat-card">
      <label class="stat-label">Unmatched</label>
      <div class="stat-value">{{ stats.unmatched }}</div>
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
  /* A flat 150px floor plus the 1rem gap overflows a 320px screen once two
     cards share a row. min() keeps the 150px preference on wider viewports but
     lets the card collapse rather than push the document sideways. */
  min-width: min(150px, 100%);
}

.stat-label {
  display: block;
  color: var(--color-text-muted, #6b7280);
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 1.875rem;
  font-weight: 600;
}
</style>
