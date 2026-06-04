<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getVillageServiceRequests } from '../api/serviceRequestApi.js'

const router = useRouter()
const route = useRoute()

const villageId = computed(() => route.params.villageId)
const serviceRequestId = computed(() => route.params.id)

const { state: requests } = useAsyncState(
  () => getVillageServiceRequests(villageId.value),
  { immediate: true }
)

const request = computed(() => requests.value?.find(r => r.serviceRequestId === serviceRequestId.value))

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleString()
}
</script>

<template>
  <div class="request-detail">
    <div v-if="request" class="detail-card">
      <h1>{{ request.serviceName ?? 'Service Request' }}</h1>

      <div class="detail-field">
        <span class="label">Request ID:</span>
        <span class="value">{{ request.serviceRequestId }}</span>
      </div>

      <div class="detail-field">
        <span class="label">Request Number:</span>
        <span class="value">{{ request.requestNumber ?? '—' }}</span>
      </div>

      <div class="detail-field">
        <span class="label">Status:</span>
        <span class="value status-badge" :data-status="request.status">
          {{ request.status ?? '—' }}
        </span>
      </div>

      <div class="detail-field">
        <span class="label">Service Type:</span>
        <span class="value">{{ request.serviceName ?? '—' }}</span>
      </div>

      <div class="detail-field">
        <span class="label">Transportation Type:</span>
        <span class="value">{{ request.transportationType ?? '—' }}</span>
      </div>

      <div class="detail-field">
        <span class="label">Member:</span>
        <span class="value">{{ request.memberFullName ?? '—' }}</span>
      </div>

      <div class="detail-field">
        <span class="label">Volunteer:</span>
        <span class="value">{{ request.volunteerFullName ?? '—' }}</span>
      </div>

      <div class="detail-field">
        <span class="label">Created At:</span>
        <span class="value">{{ formatDate(request.createdAt) }}</span>
      </div>

      <div class="detail-field">
        <span class="label">Start At:</span>
        <span class="value">{{ formatDate(request.startAt) }}</span>
      </div>

      <div class="detail-field">
        <span class="label">Finish At:</span>
        <span class="value">{{ formatDate(request.finishAt) }}</span>
      </div>

      <div class="detail-field">
        <span class="label">Address:</span>
        <span class="value">{{ request.address ?? '—' }}</span>
      </div>

      <div class="detail-field">
        <span class="label">City:</span>
        <span class="value">{{ request.city ?? '—' }}</span>
      </div>

      <div class="detail-field">
        <span class="label">Phone:</span>
        <span class="value">{{ request.phone ?? '—' }}</span>
      </div>

      <div class="detail-field">
        <span class="label">Destination:</span>
        <span class="value">{{ request.destination ?? '—' }}</span>
      </div>

      <div v-if="request.instructions" class="detail-field">
        <span class="label">Instructions:</span>
        <span class="value multi-line">{{ request.instructions }}</span>
      </div>

      <div v-if="request.description" class="detail-field">
        <span class="label">Description:</span>
        <span class="value multi-line">{{ request.description }}</span>
      </div>
    </div>

    <div v-else class="not-found">
      <p>Service request not found.</p>
    </div>
  </div>
</template>

<style scoped>
.request-detail {
  padding: 2rem;
}

.detail-card {
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  padding: 2rem;
  max-width: 700px;
}

h1 {
  margin: 0 0 2rem 0;
  font-size: 1.75rem;
  color: var(--color-text-primary);
}

.detail-field {
  display: flex;
  flex-direction: column;
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--color-border-default);
}

.detail-field:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.detail-field .label {
  font-weight: 600;
  color: var(--color-text-dim);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.5rem;
}

.detail-field .value {
  color: var(--color-text-primary);
  font-size: 1rem;
  word-break: break-word;
}

.value.multi-line {
  white-space: pre-wrap;
  line-height: 1.5;
}

.status-badge {
  display: inline-block;
  padding: 0.35rem 0.7rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  width: fit-content;
}

.status-badge[data-status="open"] {
  background-color: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.status-badge[data-status="confirmed"] {
  background-color: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.status-badge[data-status="completed"] {
  background-color: rgba(147, 51, 234, 0.15);
  color: #d8b4fe;
}

.status-badge[data-status="unmatched"] {
  background-color: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}

.status-badge[data-status="cancelled"] {
  background-color: rgba(107, 114, 128, 0.15);
  color: #d1d5db;
}

.not-found {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-dim);
}

@media (max-width: 768px) {
  .request-detail {
    padding: 1rem;
  }

  .detail-card {
    padding: 1.5rem;
  }
}
</style>
