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

const member = computed(() => person.value)
</script>

<template>
  <div class="member-detail">
    <div v-if="member" class="detail-card">
      <h1>{{ member.fullName }}</h1>

      <div class="detail-field">
        <span class="label">Person ID:</span>
        <span class="value">{{ member.personId }}</span>
      </div>

      <div class="detail-field">
        <span class="label">Person ID:</span>
        <span class="value">{{ member.personId }}</span>
      </div>

      <div v-if="member.email" class="detail-field">
        <span class="label">Email:</span>
        <span class="value">{{ member.email }}</span>
      </div>

      <div v-if="member.cell" class="detail-field">
        <span class="label">Cell:</span>
        <span class="value">{{ member.cell }}</span>
      </div>

      <div v-if="member.address" class="detail-field">
        <span class="label">Address:</span>
        <span class="value">{{ member.address }}</span>
      </div>

      <div v-if="member.city || member.state || member.zip" class="detail-field">
        <span class="label">City, State, Zip:</span>
        <span class="value">{{ member.city }}{{ member.state ? ', ' + member.state : '' }}{{ member.zip ? ' ' + member.zip : '' }}</span>
      </div>

      <div v-if="member.emergencyContactName" class="detail-field">
        <span class="label">Emergency Contact Name:</span>
        <span class="value">{{ member.emergencyContactName }}</span>
      </div>

      <div v-if="member.emergencyContactRelationship" class="detail-field">
        <span class="label">Emergency Contact Relationship:</span>
        <span class="value">{{ member.emergencyContactRelationship }}</span>
      </div>

      <div v-if="member.emergencyContactPhone" class="detail-field">
        <span class="label">Emergency Contact Phone:</span>
        <span class="value">{{ member.emergencyContactPhone }}</span>
      </div>
    </div>

    <div v-else class="not-found">
      <p>Member not found.</p>
    </div>
  </div>
</template>

<style scoped>
.member-detail {
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
  word-break: break-word;
}

.not-found {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-dim);
}

@media (max-width: 768px) {
  .member-detail {
    padding: 1rem;
  }

  .detail-card {
    padding: 1.5rem;
  }
}
</style>
