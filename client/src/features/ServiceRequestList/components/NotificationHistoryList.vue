<script setup>
import { computed } from 'vue'
import Tag from 'primevue/tag'
import {
  eventStatus,
  eventStatusSeverity,
  outcomeLabel,
  eventTypeLabel,
  recipientNames,
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
      No notifications sent yet.
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
      <div class="recipients">{{ recipientNames(entry) }}</div>
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
  font-size: 0.9rem;
  color: var(--color-text-primary);
  word-break: break-word;
}
</style>
