<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { apiCall } from '../../../shared/api/apiClient.js'
import PersonDetailCard from '../../../shared/components/PersonDetailCard.vue'

const route = useRoute()
const personId = computed(() => route.params.personId)

const { state: person } = useAsyncState(
  () => apiCall('getPerson', { personId: personId.value, projection: ['memberInfo', 'volunteerInfo'] }),
  { immediate: true }
)

const personType = computed(() => {
  const roles = person.value?.roles ?? []
  const isMember = roles.includes('member')
  const isVolunteer = roles.includes('volunteer')
  if (isMember && isVolunteer) return 'member, volunteer'
  if (isVolunteer) return 'volunteer'
  return 'member'
})
</script>

<template>
  <div class="person-detail">
    <PersonDetailCard v-if="person" :person="person" :person-type="personType" />
  </div>
</template>

<style scoped>
.person-detail {
  padding: 2rem;
}
</style>
