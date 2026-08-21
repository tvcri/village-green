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
  view: { type: String, required: true },      // 'counts' | 'share'
  sort: { type: String, required: true },
  dir: { type: String, required: true },       // 'asc' | 'desc'
  csvFilename: { type: String, required: true },
  dark: { type: Boolean, default: false },
  emptyMessage: { type: String, default: 'No requests in this range' },
})

defineEmits(['update:sort'])

defineOptions({ name: 'MetaOutcomesCard' })

const hasRows = computed(() => props.rows.length > 0)

// The legend sits above the table rather than inside a chart. It names the same
// colors the column-header swatches and the in-row bars use.
const legend = computed(() =>
  props.series.map(s => ({
    key: s.key,
    label: s.label,
    color: props.dark ? s.colorDark : s.colorLight,
  })),
)

const scaleNote = computed(() => (props.view === 'share'
  ? 'Each bar is that village’s own total, split by outcome.'
  : 'Bars share one scale, so lengths compare directly between villages.'))
</script>

<template>
  <section class="meta-outcomes-card">
    <template v-if="hasRows">
      <div class="card-head">
        <ul class="legend">
          <li v-for="item in legend" :key="item.key">
            <span class="key" :style="{ backgroundColor: item.color }" aria-hidden="true" />
            {{ item.label }}
          </li>
        </ul>
        <p class="scale-note">{{ scaleNote }}</p>
      </div>

      <MetaMatrixTable
        :rows="rows"
        :series="series"
        :view="view"
        :sort="sort"
        :dir="dir"
        :csvFilename="csvFilename"
        :dark="dark"
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

.card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.35rem 1.5rem;
  margin-bottom: 0.75rem;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
}

.legend li {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.key {
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 2px;
}

.scale-note {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-text-muted, #6b7280);
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
