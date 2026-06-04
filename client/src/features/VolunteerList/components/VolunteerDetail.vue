<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getVillagePerson } from '../../../shared/api/villageApi.js'

const router = useRouter()
const route = useRoute()

const villageId = computed(() => route.params.villageId)
const personId = computed(() => route.params.personId)

const { state: person } = useAsyncState(
  () => getVillagePerson(villageId.value, personId.value),
  { immediate: true }
)

const volunteer = computed(() => person.value)
</script>

<template>
  <div class="volunteer-detail">
    <div v-if="volunteer" class="detail-card">
      <h1>{{ volunteer.fullName }}</h1>

      <div class="detail-field">
        <span class="label">Person ID:</span>
        <span class="value">{{ volunteer.personId }}</span>
      </div>

      <div class="detail-field">
        <span class="label">Person ID:</span>
        <span class="value">{{ volunteer.personId }}</span>
      </div>

      <div v-if="volunteer.email" class="detail-field">
        <span class="label">Email:</span>
        <span class="value">{{ volunteer.email }}</span>
      </div>

      <div v-if="volunteer.cell" class="detail-field">
        <span class="label">Cell:</span>
        <span class="value">{{ volunteer.cell }}</span>
      </div>

      <div v-if="volunteer.address" class="detail-field">
        <span class="label">Address:</span>
        <span class="value">{{ volunteer.address }}</span>
      </div>

      <div v-if="volunteer.city || volunteer.state || volunteer.zip" class="detail-field">
        <span class="label">City, State, Zip:</span>
        <span class="value">{{ volunteer.city }}{{ volunteer.state ? ', ' + volunteer.state : '' }}{{ volunteer.zip ? ' ' + volunteer.zip : '' }}</span>
      </div>

      <div v-if="volunteer.emergencyContactName" class="detail-field">
        <span class="label">Emergency Contact Name:</span>
        <span class="value">{{ volunteer.emergencyContactName }}</span>
      </div>

      <div v-if="volunteer.emergencyContactRelationship" class="detail-field">
        <span class="label">Emergency Contact Relationship:</span>
        <span class="value">{{ volunteer.emergencyContactRelationship }}</span>
      </div>

      <div v-if="volunteer.emergencyContactPhone" class="detail-field">
        <span class="label">Emergency Contact Phone:</span>
        <span class="value">{{ volunteer.emergencyContactPhone }}</span>
      </div>
    </div>

    <div v-else class="not-found">
      <p>Volunteer not found.</p>
    </div>
  </div>
</template>

<style scoped>
.volunteer-detail {
  padding: 2rem;
}

.detail-card {
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  padding: 2rem;
  max-width: 600px;
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
}

.capabilities-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.capability-badge {
  display: inline-block;
  padding: 0.35rem 0.7rem;
  background-color: var(--color-background-dark);
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  font-size: 0.85rem;
  color: var(--color-text-dim);
}

.no-capabilities {
  color: var(--color-text-dim);
  font-style: italic;
}

.not-found {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-dim);
}

@media (max-width: 768px) {
  .volunteer-detail {
    padding: 1rem;
  }

  .detail-card {
    padding: 1.5rem;
  }
}
</style>
