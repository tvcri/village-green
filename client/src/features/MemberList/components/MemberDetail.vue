<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Card from 'primevue/card'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getVillagePerson } from '../../../shared/api/villageApi.js'
import { getVillageMembers } from '../api/memberApi.js'

const router = useRouter()
const route = useRoute()

const villageId = computed(() => route.params.villageId)
const personId = computed(() => route.params.personId)

const { state: person } = useAsyncState(
  () => getVillagePerson(villageId.value, personId.value),
  { immediate: true }
)

const { state: memberData } = useAsyncState(
  () => villageId.value ? getVillageMembers(villageId.value) : Promise.resolve([]),
  { immediate: true }
)

const member = computed(() => {
  // Find the member data matching this personId
  const memberRecord = memberData.value?.find(m => m.personId === personId.value)
  // Merge person data with member data
  return { ...memberRecord, ...person.value }
})
</script>

<template>
  <div class="member-detail">
    <Card v-if="member" class="detail-card">
      <template #title>{{ member.fullName }}</template>
      <template #content>
        <div class="detail-field">
          <span class="label">Person ID:</span>
          <span class="value">{{ member.personId }}</span>
        </div>

        <div v-if="member.memberNumber" class="detail-field">
          <span class="label">Member #:</span>
          <span class="value">{{ member.memberNumber }}</span>
        </div>

        <div v-if="member.memberLevel" class="detail-field">
          <span class="label">Member Level:</span>
          <span class="value">{{ member.memberLevel }}</span>
        </div>

        <div v-if="member.joinDate" class="detail-field">
          <span class="label">Join Date:</span>
          <span class="value">{{ member.joinDate }}</span>
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
      </template>
    </Card>

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
  max-width: 800px;
  border: 1px solid var(--color-border-default);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

:deep(.p-card-content) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
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

.not-found {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-dim);
}

@media (max-width: 768px) {
  .member-detail {
    padding: 1rem;
  }

  :deep(.p-card-content) {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>
