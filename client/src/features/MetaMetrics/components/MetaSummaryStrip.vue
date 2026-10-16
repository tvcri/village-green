<script setup>
defineProps({
  stats: {
    type: Object,
    required: true,
    // { villages, requests, completed, cancelled, unmatched,
    //   <outcome>Pct, <outcome>PctBase } — see metaStripStats
  },
})

defineOptions({ name: 'MetaSummaryStrip' })

// `pct` names the percentage key where one exists. Villages and Requests have
// no denominator, so they carry none — "5,161 completed" does not read as a
// rate at a glance, but "13 villages" needs no help.
const CARDS = [
  { label: 'Villages', key: 'villages' },
  { label: 'Requests', key: 'requests' },
  { label: 'Completed', key: 'completed', pct: 'completedPct' },
  { label: 'Cancelled', key: 'cancelled', pct: 'cancelledPct' },
  { label: 'Unmatched', key: 'unmatched', pct: 'unmatchedPct',
    title: 'Unmatched ÷ (unmatched + completed). Cancelled requests are left out.' },
]

// One decimal, matching the tables, followed by its base ("of all", "of not
// cancelled"): the cards do not share a denominator, so each names its own.
// Only rendered when the stats carry a number — an empty range yields null,
// and "0.0%" there would look like a measurement rather than an absence.
function shareFor (card, stats) {
  const value = card.pct ? stats[card.pct] : null
  return typeof value === 'number' ? `${value.toFixed(1)}% ${stats[`${card.pct}Base`]}` : ''
}
</script>

<template>
  <div class="summary-strip">
    <div v-for="card in CARDS" :key="card.key" class="stat-card">
      <label class="stat-label">{{ card.label }}</label>
      <div class="stat-value">
        {{ stats[card.key].toLocaleString() }}
        <span v-if="shareFor(card, stats)" class="stat-share" :title="card.title">{{ shareFor(card, stats) }}</span>
      </div>
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

.stat-value {
  font-size: 1.875rem;
  font-weight: 600;
  /* Baseline, so the small share sits on the same line as the big number
     rather than centring against its full height. */
  display: flex;
  align-items: baseline;
  /* "7.3% of not cancelled" is wider than a narrow card can hold beside the
     number; let it drop to its own line rather than squeeze the count. */
  flex-wrap: wrap;
  column-gap: 0.4rem;
}

/* Deliberately quiet: the count is the headline and the share is the gloss on
   it. Same muted colour as the label above, at a size that reads as secondary
   without becoming unreadable. */
.stat-share {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-text-muted, #6b7280);
}
</style>
