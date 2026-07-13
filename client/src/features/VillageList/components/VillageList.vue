<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useCurrentUser } from '../../../shared/composables/useCurrentUser.js'
import { useStatusSeverity } from '../../../shared/composables/useStatusSeverity.js'
import { getHttpStatus } from '../../../shared/api/apiClient.js'
import { getVillages } from '../api/villageApi.js'

const router = useRouter()
const { hasFederationAccess } = useCurrentUser()
const { getStatusSeverity } = useStatusSeverity()

const { state: villages, isLoading, error } = useAsyncState(
  () => getVillages(['personCounts', 'srStatusCounts']),
  // A 403 here means the user has no village access at all (no grants, not
  // admin, not a volunteer) — an expected outcome, not a bug. Show it inline
  // instead of the global crash-style error modal.
  { immediate: true, onError: null }
)

const isAccessDenied = computed(() => getHttpStatus(error.value) === 403)

const isEmpty = computed(() => !isLoading.value && Array.isArray(villages.value) && villages.value.length === 0)

const getTotalPersonCount = (village) => {
  const counts = village.personCounts || {}
  return (counts.member ?? 0) + (counts.volunteer ?? 0) + (counts.both ?? 0)
}

const metaVillageCounts = computed(() => {
  if (!Array.isArray(villages.value) || villages.value.length <= 1) return null
  return villages.value.reduce(
    (acc, v) => {
      acc.member += v.personCounts?.member ?? 0
      acc.volunteer += v.personCounts?.volunteer ?? 0
      acc.both += v.personCounts?.both ?? 0
      acc.open += v.srStatusCounts?.open ?? 0
      acc.confirmed += v.srStatusCounts?.confirmed ?? 0
      return acc
    },
    { member: 0, volunteer: 0, both: 0, open: 0, confirmed: 0 }
  )
})

// Meta Village is visible to users holding any federation-scoped role grant.
const showMetaVillage = computed(() => hasFederationAccess.value)

const navigateToVillage = (villageId) => {
  router.push({ name: 'village-detail', params: { villageId } })
}
</script>

<template>
  <div class="village-list">
    <h1>Villages</h1>

    <div v-if="isLoading" class="loading-state">
      <p>Loading villages...</p>
    </div>

    <div v-else-if="isAccessDenied" class="error-state">
      <p>You don't have access to any villages yet. Contact your administrator if you believe this is a mistake.</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>Unable to load villages. Please try again.</p>
    </div>

    <div v-else-if="isEmpty" class="empty-state">
      <p>No villages found</p>
    </div>

    <div v-else class="village-grid">
      <Card
        v-if="showMetaVillage && metaVillageCounts"
        class="village-card meta-village-card"
        @click="router.push({ name: 'meta' })"
      >
        <template #title>
          <div class="title-header">
            <span class="village-name">Meta Village</span>
            <Tag
              icon="pi pi-users"
              :value="`${metaVillageCounts.member + metaVillageCounts.volunteer + metaVillageCounts.both}`"
              severity="secondary"
            />
          </div>
        </template>
        <template #content>
          <div class="people-grid">
            <div class="person-stat">
              <div class="person-label">Members</div>
              <div class="person-value">{{ metaVillageCounts.member }}</div>
            </div>
            <div class="person-stat">
              <div class="person-label">Volunteers</div>
              <div class="person-value">{{ metaVillageCounts.volunteer }}</div>
            </div>
            <div class="person-stat">
              <div class="person-label">Both</div>
              <div class="person-value">{{ metaVillageCounts.both }}</div>
            </div>
          </div>
          <div class="sr-grid">
            <div class="sr-stat">
              <div class="sr-label">Open</div>
              <Tag :value="`${metaVillageCounts.open}`" :severity="getStatusSeverity('open')" class="sr-tag" />
            </div>
            <div class="sr-stat">
              <div class="sr-label">Confirmed</div>
              <Tag :value="`${metaVillageCounts.confirmed}`" :severity="getStatusSeverity('confirmed')" class="sr-tag" />
            </div>
          </div>
        </template>
      </Card>
      <Card
        v-for="village in villages"
        :key="village.villageId"
        class="village-card"
        @click="navigateToVillage(village.villageId)"
      >
        <template #title>
          <div class="title-header">
            <span class="village-name">{{ village.name }}</span>
            <Tag v-if="village.personCounts" icon="pi pi-users" :value="`${getTotalPersonCount(village)}`" severity="secondary" />
          </div>
        </template>
        <template #content class="card-stats">
          <div v-if="village.personCounts" class="people-grid">
            <div class="person-stat">
              <div class="person-label">Members</div>
              <div class="person-value">{{ village.personCounts.member ?? 0 }}</div>
            </div>
            <div class="person-stat">
              <div class="person-label">Volunteers</div>
              <div class="person-value">{{ village.personCounts.volunteer ?? 0 }}</div>
            </div>
            <div class="person-stat">
              <div class="person-label">Both</div>
              <div class="person-value">{{ village.personCounts.both ?? 0 }}</div>
            </div>
          </div>
          <div v-if="village.srStatusCounts" class="sr-grid">
            <div class="sr-stat">
              <div class="sr-label">Open</div>
              <Tag :value="`${village.srStatusCounts.open ?? 0}`" :severity="getStatusSeverity('open')" class="sr-tag" />
            </div>
            <div class="sr-stat">
              <div class="sr-label">Confirmed</div>
              <Tag :value="`${village.srStatusCounts.confirmed ?? 0}`" :severity="getStatusSeverity('confirmed')" class="sr-tag" />
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.village-list {
  padding: 2rem;
}

h1 {
  margin-top: 0;
  color: var(--color-text-primary);
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-dim);
  font-style: italic;
}

.error-state {
  color: var(--color-text-error);
}

.village-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
}

.village-card {
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid var(--color-border-default);
  box-shadow: var(--box-shadow-card);
}

.village-card:hover {
  transform: translateY(-2px);
}

.meta-village-card {
  border: 2px dashed var(--color-border-default);
  opacity: 0.85;
}

.meta-village-card:hover {
  opacity: 1;
}

.title-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.village-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.card-stats {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.people-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.person-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.person-label {
  font-size: 0.75rem;
  color: var(--color-text-dim);
  font-weight: 500;
}

.person-value {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.sr-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  max-width: 100px;
  margin: 0 auto;
  margin-bottom: 0.25rem;
}

.sr-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.sr-label {
  font-size: 0.75rem;
  color: var(--color-text-dim);
  font-weight: 500;
}

:deep(.sr-tag.p-tag) {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
}

:deep(.village-card .p-card-body) {
  padding: 0.5rem 0.75rem;
}

.sr-value {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.stat {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.stat .label {
  color: var(--color-text-dim);
}

.stat .value {
  font-weight: 600;
  color: var(--color-text-bright);
}

/* Mobile responsive */
@media (max-width: 768px) {
  .village-list {
    padding: 1rem;
  }

  .village-grid {
    gap: 1rem;
  }
}
</style>
