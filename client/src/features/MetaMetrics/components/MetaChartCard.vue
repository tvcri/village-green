<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  height: { type: Number, default: 520 },
})
</script>

<template>
  <section class="meta-chart-card">
    <header>
      <h2>{{ title }}</h2>
      <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
      <div v-if="$slots.controls" class="controls"><slot name="controls" /></div>
    </header>
    <!-- Chart.js needs a positioned, explicitly-sized parent: with
         maintainAspectRatio false it fills its container, and a percentage
         height against an auto-height parent collapses to zero. -->
    <div class="chart-body" :style="{ height: `${height}px` }">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.meta-chart-card {
  background: var(--color-bg-secondary, #fff);
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  padding: 1.25rem 1.5rem 1.5rem;
  margin-bottom: 1.5rem;
  min-width: 0;
}

header { margin-bottom: 1rem; }

h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.controls {
  margin-top: 0.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  align-items: center;
}

.chart-body {
  position: relative;
  min-width: 0;
}

@media (max-width: 640px) {
  .meta-chart-card { padding: 1rem; }
}
</style>
