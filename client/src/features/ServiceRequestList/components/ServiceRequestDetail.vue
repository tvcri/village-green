<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useStatusSeverity } from '../../../shared/composables/useStatusSeverity.js'
import { getVillageServiceRequests } from '../api/serviceRequestApi.js'

const route = useRoute()
const { getStatusSeverity } = useStatusSeverity()

const villageId = computed(() => route.params.villageId)
const serviceRequestId = computed(() => route.params.id)

const { state: requests } = useAsyncState(
  () => getVillageServiceRequests(villageId.value),
  { immediate: true }
)

const request = computed(() => requests.value?.find(r => r.serviceRequestId === serviceRequestId.value))

function formatDate(dateStr) {
  if (!dateStr) return null
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatDateOnly(dateStr) {
  if (!dateStr) return null
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function formatTimeOnly(dateStr) {
  if (!dateStr) return null
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function formatTimeRange(startStr, finishStr) {
  const start = formatTimeOnly(startStr)
  const finish = formatTimeOnly(finishStr)
  if (!start || !finish) return null
  return `${start} - ${finish}`
}

</script>

<template>
  <div class="request-detail">
    <Card v-if="request" class="detail-card">
      <template #header>
        <div class="card-header-wrapper">
          <h2 class="card-title">{{ request.serviceName ?? 'Service Request' }}</h2>
          <Tag
            v-if="request.status"
            :value="request.status"
            :severity="getStatusSeverity(request.status)"
          />
        </div>
      </template>
      <template #content>
        <!-- Persons Section -->
        <div class="section">
          <h3 class="section-header">Persons</h3>
          <div v-if="request.memberFullName" class="detail-field">
            <span class="label">Member:</span>
            <span class="value"><strong>{{ request.memberFullName }}</strong></span>
          </div>

          <div v-if="request.volunteerFullName" class="detail-field">
            <span class="label">Volunteer:</span>
            <span class="value"><strong>{{ request.volunteerFullName }}</strong></span>
          </div>
        </div>

        <!-- Description Section -->
        <div v-if="request.description" class="section description-section">
          <h3 class="section-header">Description</h3>
          <p class="description-text">{{ request.description }}</p>
        </div>

        <!-- Request Section -->
        <div class="section">
          <h3 class="section-header">Request</h3>
          <div v-if="request.startAt" class="detail-field">
            <span class="label">Date:</span>
            <span class="value">{{ formatDateOnly(request.startAt) }}</span>
          </div>

          <div v-if="request.startAt && request.finishAt" class="detail-field">
            <span class="label">Start/Finish:</span>
            <span class="value">{{ formatTimeRange(request.startAt, request.finishAt) }}</span>
          </div>

          <div v-if="request.transportationType" class="detail-field">
            <span class="label">Transportation Type:</span>
            <span class="value">{{ request.transportationType }}</span>
          </div>

          <div v-if="request.destination" class="detail-field">
            <span class="label">Destination:</span>
            <span class="value">{{ request.destination }}</span>
          </div>

          <div v-if="request.address" class="detail-field">
            <span class="label">Address:</span>
            <span class="value">{{ request.address }}</span>
          </div>

          <div v-if="request.city" class="detail-field">
            <span class="label">City:</span>
            <span class="value">{{ request.city }}</span>
          </div>

          <div v-if="request.phone" class="detail-field">
            <span class="label">Phone:</span>
            <div class="phone-numbers">
              <a :href="`tel:${request.phone}`" class="phone-item">
                <i class="pi pi-phone"></i>
                <span class="phone-number">{{ request.phone }}</span>
              </a>
            </div>
          </div>

          <div v-if="request.createdAt" class="detail-field">
            <span class="label">Created At:</span>
            <span class="value">{{ formatDate(request.createdAt) }}</span>
          </div>

          <div v-if="request.requestNumber" class="detail-field">
            <span class="label">Request Number:</span>
            <span class="value">{{ request.requestNumber }}</span>
          </div>
        </div>
      </template>
    </Card>

    <div v-else class="not-found">
      <p>Service request not found.</p>
    </div>
  </div>
</template>

<style scoped>
@import '../../../shared/styles/phone-link.css';

.request-detail {
  padding: 2rem;
}

.detail-card {
  max-width: 800px;
  border: 1px solid var(--color-border-default);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

:deep(.p-card-title) {
  font-weight: 700;
  font-size: 2rem;
}

:deep(.p-card-header) {
  padding: 1.5rem 1.5rem 0 1.5rem;
  background-color: transparent;
}

.card-header-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  width: 100%;
}

.card-title {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  flex: 1;
}

:deep(.p-tag) {
  font-size: 1rem;
  padding: 0.5rem 1rem;
}

:deep(.p-card-content) {
  display: block;
}

.detail-field {
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
  margin-bottom: 0;
  border-bottom: none;
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

.detail-field a.value {
  color: var(--color-text-primary);
  border-bottom: 1px solid rgba(0, 0, 0, 0.5);
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.detail-field a.value:hover {
  opacity: 0.7;
}


.section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem 1rem;
  margin-top: 2rem;
  margin-bottom: 2rem;
}

.section:first-of-type {
  margin-top: 1rem;
}

.section:last-child {
  margin-bottom: 0;
}

.section-header {
  grid-column: 1 / -1;
  margin: 0 0 0.75rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-primary);
  border-bottom: 2px solid var(--color-border-default);
  padding-bottom: 0.75rem;
}

.description-section {
  grid-template-columns: 1fr;
}

.description-text {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 1rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
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

  .section {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>
