<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getVillagePerson } from '../../../shared/api/villageApi.js'
import { getVillageVolunteers } from '../api/volunteerApi.js'
import PersonDetailCard from '../../../shared/components/PersonDetailCard.vue'

const route = useRoute()

const villageId = computed(() => route.params.villageId)
const personId = computed(() => route.params.personId)

const { state: person } = useAsyncState(
  () => getVillagePerson(villageId.value, personId.value),
  { immediate: true, onError: null }
)

const { state: volunteers } = useAsyncState(
  () => villageId.value ? getVillageVolunteers(villageId.value) : Promise.resolve([]),
  { immediate: true, onError: null }
)

const volunteer = computed(() => {
  if (!person.value) return null
  const volunteerRecord = volunteers.value?.find(v => v.personId === personId.value)
  return { ...person.value, ...volunteerRecord }
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
