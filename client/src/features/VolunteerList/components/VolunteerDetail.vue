<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getPerson } from '../../PersonList/api/personApi.js'
import PersonDetailCard from '../../../shared/components/PersonDetailCard.vue'

const route = useRoute()

const personId = computed(() => route.params.personId)

// getPerson returns the full person (flat phone/cell) plus volunteer data via
// the volunteer projection. Flatten it so PersonDetailCard can read
// capabilities directly — but only when the volunteer role is active (see
// MemberDetail.vue for the read_inactive rationale).
const { state: person } = useAsyncState(
  () => getPerson(personId.value, ['volunteer']),
  { immediate: true, onError: null }
)

const volunteer = computed(() => {
  if (!person.value) return null
  const { volunteer: volunteerData, ...rest } = person.value
  return { ...rest, ...((person.value.roles ?? []).includes('volunteer') ? volunteerData : null) }
})
</script>

<template>
  <div class="volunteer-detail">
    <PersonDetailCard v-if="volunteer" :person="volunteer" person-type="volunteer" />
  </div>
</template>

<style scoped>
.volunteer-detail {
  padding: 2rem;
}
</style>
