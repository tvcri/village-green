<script setup>
import { computed } from 'vue'
import Tag from 'primevue/tag'
import {
  eventStatus,
  eventStatusSeverity,
  outcomeLabel,
  eventTypeLabel,
  recipientList,
  sortHistory,
} from '../lib/notificationHistory.js'

defineOptions({ name: 'NotificationHistoryList' })

const props = defineProps({
  history: { type: Array, default: () => [] },
})

const sorted = computed(() => sortHistory(props.history))
</script>

<template>
  <div class="notification-history">
    <p v-if="sorted.length === 0" class="empty-message">
      No notifications recorded.
    </p>
    <div
      v-for="entry in sorted"
      v-else
      :key="entry.id"
      class="history-row"
    >
      <div class="history-row-top">
        <span class="event-type">{{ eventTypeLabel(entry.eventType) }}</span>
        <Tag
          :value="eventStatus(entry)"
          :severity="eventStatusSeverity(eventStatus(entry))"
        />
        <span class="outcome-time">{{ outcomeLabel(entry) }}</span>
      </div>
      <div class="recipients">
        <template v-if="recipientList(entry).length">
          <span
            v-for="(name, i) in recipientList(entry)"
            :key="i"
            class="recipient-chip"
          >{{ name }}</span>
        </template>
        <span v-else class="recipients-empty">—</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notification-history {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.empty-message {
  color: var(--color-text-dim);
  font-style: italic;
  margin: 0;
}

.history-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border-default);
}

.history-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.history-row-top {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.event-type {
  font-weight: 600;
  color: var(--color-text-primary);
}

.outcome-time {
  font-size: 0.85rem;
  color: var(--color-text-dim);
  margin-left: auto;
}

.recipients {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

/* Lightweight read-only chips. Names are "Last, First", so each goes in its own
   chip to avoid the ambiguity of a comma-joined list. Uses --color-background-subtle
   (a faint translucent tint defined for both light and dark in style.css) so the
   chip reads as a quiet tag with contrast in either theme. */
.recipient-chip {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--color-text-primary);
  background-color: var(--color-background-subtle);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  white-space: nowrap;
}

.recipients-empty {
  font-size: 0.9rem;
  color: var(--color-text-dim);
}
</style>
