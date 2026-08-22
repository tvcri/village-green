<script setup>
import { computed } from 'vue'
import MetaMatrixTable from './MetaMatrixTable.vue'

// Replaces MetaChartCard. That component wrapped a Chart.js canvas above this
// same table; the canvas is gone — the bars now live IN the table's rows, so a
// village's bar and its numbers cannot end up on different lines or in
// different scroll positions. See the 2026-08-21 amendment at the top of
// docs/superpowers/specs/2026-08-21-meta-metrics-presentation-design.md.
//
// What went with the canvas: chartHeight(), the :deep(.p-chart) sizing rule,
// the ResizeObserver, and the chart-vs-table layout question entirely.

const props = defineProps({
  rows: { type: Array, required: true },       // ALREADY ordered by the parent
  series: { type: Array, required: true },
  view: { type: String, required: true },      // 'counts' | 'percent'
  sort: { type: String, required: true },
  dir: { type: String, required: true },       // 'asc' | 'desc'
  csvFilename: { type: String, required: true },
  dark: { type: Boolean, default: false },
  emptyMessage: { type: String, default: 'No requests in this range' },
  // 'grouped' (Outcomes) or 'stacked' (Categories) — see MetaMatrixTable.
  layout: { type: String, default: 'grouped' },
})

defineEmits(['update:sort'])

defineOptions({ name: 'MetaOutcomesCard' })

const hasRows = computed(() => props.rows.length > 0)

</script>

<template>
  <section class="meta-outcomes-card">
    <template v-if="hasRows">
      <!-- No legend row here: the table's own column headers carry a swatch
           beside each outcome name, so a second key above the table would
           repeat itself. -->
      <MetaMatrixTable
        :rows="rows"
        :series="series"
        :view="view"
        :sort="sort"
        :dir="dir"
        :csvFilename="csvFilename"
        :dark="dark"
        :layout="layout"
        @update:sort="$emit('update:sort', $event)"
      />
    </template>

    <p v-else class="empty-msg">{{ emptyMessage }}</p>
  </section>
</template>

<style scoped>
.meta-outcomes-card {
  background: var(--color-background-light);
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  padding: 1.25rem 1.5rem 1.5rem;
  min-width: 0;
}

.empty-msg {
  margin: 0;
  padding: 2rem 0;
  text-align: center;
  color: var(--color-text-muted, #6b7280);
}

@media (max-width: 640px) {
  .meta-outcomes-card { padding: 1rem; }
}
</style>
