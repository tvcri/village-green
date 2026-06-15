<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useStatusSeverity } from '../../../shared/composables/useStatusSeverity.js'
import { getServiceRequest } from '../api/serviceRequestApi.js'
import ServiceRequestMap from '../../../components/ServiceRequestMap.vue'

const route = useRoute()
const { getStatusSeverity } = useStatusSeverity()

const serviceRequestId = computed(() => route.params.id)

const { state: request } = useAsyncState(
  () => getServiceRequest(serviceRequestId.value, ['memberAddress', 'volunteerAddress']),
  { immediate: true }
)

const SHOW_MAP_KEY = 'vg.showMap'
const showMap = ref(localStorage.getItem(SHOW_MAP_KEY) !== 'false')

function toggleMap() {
  showMap.value = !showMap.value
  localStorage.setItem(SHOW_MAP_KEY, showMap.value)
}

const volunteerAddress = computed(() => request.value?.volunteerAddress ?? null)

const mapOrigin = computed(() => {
  const vol = volunteerAddress.value
  if (vol) return [vol.address, vol.city, vol.state, vol.zip].filter(Boolean).join(', ')
  const mem = request.value?.memberAddress
  if (!mem) return ''
  return [mem.address, mem.city, mem.state, mem.zip].filter(Boolean).join(', ')
})

const mapDestination = computed(() => {
  const r = request.value
  if (!r || (!r.address && !r.city)) return ''
  return [r.address, r.city, 'RI'].filter(Boolean).join(', ')
})

const mapWaypoint = computed(() => {
  if (!volunteerAddress.value) return ''
  const mem = request.value?.memberAddress
  if (!mem) return ''
  return [mem.address, mem.city, mem.state, mem.zip].filter(Boolean).join(', ')
})

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
        <!-- Member Section -->
        <div class="section">
          <h3 class="section-header">Member</h3>
          <div v-if="request.memberFullName" class="detail-field">
            <span class="label">Name:</span>
            <span class="value"><strong>{{ request.memberFullName }}</strong></span>
          </div>
          <template v-if="request.memberAddress">
            <div v-if="request.memberAddress.address" class="detail-field">
              <span class="label">Address:</span>
              <span class="value">{{ request.memberAddress.address }}</span>
            </div>
            <div v-if="request.memberAddress.city || request.memberAddress.state || request.memberAddress.zip" class="detail-field">
              <span class="label">City/State/Zip:</span>
              <span class="value">{{ [request.memberAddress.city, request.memberAddress.state, request.memberAddress.zip].filter(Boolean).join(', ') }}</span>
            </div>
            <div v-if="request.memberAddress.phone" class="detail-field">
              <span class="label">Phone:</span>
              <div class="phone-numbers">
                <a :href="`tel:${request.memberAddress.phone}`" class="phone-item">
                  <i class="pi pi-phone"></i>
                  <span class="phone-number">{{ request.memberAddress.phone }}</span>
                </a>
              </div>
            </div>
            <div v-if="request.memberAddress.cell" class="detail-field">
              <span class="label">Cell:</span>
              <div class="phone-numbers">
                <a :href="`tel:${request.memberAddress.cell}`" class="phone-item">
                  <i class="pi pi-phone"></i>
                  <span class="phone-number">{{ request.memberAddress.cell }}</span>
                </a>
              </div>
            </div>
            <div v-if="request.memberAddress.email" class="detail-field">
              <span class="label">Email:</span>
              <span class="value">{{ request.memberAddress.email }}</span>
            </div>
          </template>
        </div>

        <!-- Volunteer Section -->
        <div v-if="request.volunteerFullName" class="section">
          <h3 class="section-header">Volunteer</h3>
          <div class="detail-field">
            <span class="label">Name:</span>
            <span class="value"><strong>{{ request.volunteerFullName }}</strong></span>
          </div>
          <template v-if="request.volunteerAddress">
            <div v-if="request.volunteerAddress.address" class="detail-field">
              <span class="label">Address:</span>
              <span class="value">{{ request.volunteerAddress.address }}</span>
            </div>
            <div v-if="request.volunteerAddress.city || request.volunteerAddress.state || request.volunteerAddress.zip" class="detail-field">
              <span class="label">City/State/Zip:</span>
              <span class="value">{{ [request.volunteerAddress.city, request.volunteerAddress.state, request.volunteerAddress.zip].filter(Boolean).join(', ') }}</span>
            </div>
            <div v-if="request.volunteerAddress.phone" class="detail-field">
              <span class="label">Phone:</span>
              <div class="phone-numbers">
                <a :href="`tel:${request.volunteerAddress.phone}`" class="phone-item">
                  <i class="pi pi-phone"></i>
                  <span class="phone-number">{{ request.volunteerAddress.phone }}</span>
                </a>
              </div>
            </div>
            <div v-if="request.volunteerAddress.cell" class="detail-field">
              <span class="label">Cell:</span>
              <div class="phone-numbers">
                <a :href="`tel:${request.volunteerAddress.cell}`" class="phone-item">
                  <i class="pi pi-phone"></i>
                  <span class="phone-number">{{ request.volunteerAddress.cell }}</span>
                </a>
              </div>
            </div>
            <div v-if="request.volunteerAddress.email" class="detail-field">
              <span class="label">Email:</span>
              <span class="value">{{ request.volunteerAddress.email }}</span>
            </div>
          </template>
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
        <div v-if="mapOrigin && mapDestination" class="map-section">
          <button class="map-toggle" @click="toggleMap">
            {{ showMap ? 'Always Hide Maps' : 'Always Show Maps' }}
          </button>
          <template v-if="showMap">
            <p class="map-route-label">
              <template v-if="volunteerAddress">Volunteer <span class="arrow">➜</span> Member <span class="arrow">➜</span> Destination</template>
              <template v-else>Member <span class="arrow">➜</span> Destination</template>
            </p>
            <ServiceRequestMap
              :origin="mapOrigin"
              :destination="mapDestination"
              :waypoint="mapWaypoint"
            />
          </template>
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
  max-width: 1100px;
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
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem 1.5rem;
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
  grid-column: 1 / -1;
  color: var(--color-text-primary);
  font-size: 1rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.map-section {
  margin-top: 2rem;
}

.map-route-label {
  margin: 0 0 0.5rem 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1;
}

.map-route-label .arrow {
  font-size: 1.1rem;
  font-weight: 900;
  vertical-align: middle;
  position: relative;
  top: -1px;
}

.map-toggle {
  margin-bottom: 0.75rem;
  padding: 0.4rem 1rem;
  font-size: 0.9rem;
  cursor: pointer;
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-primary);
}

.map-toggle:hover {
  background: var(--color-border-default);
}

.not-found {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-dim);
}

@media (max-width: 900px) {
  .section {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 600px) {
  .request-detail {
    padding: 1rem;
  }

  .section {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>
