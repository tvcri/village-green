<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getVillagePerson } from '../../../shared/api/villageApi.js'
import { getVillageMembers } from '../api/memberApi.js'
import PersonDetailCard from '../../../shared/components/PersonDetailCard.vue'

const route = useRoute()

const villageId = computed(() => route.params.villageId)
const personId = computed(() => route.params.personId)

const { state: person } = useAsyncState(
  () => getVillagePerson(villageId.value, personId.value),
  { immediate: true, onError: null }
)

const { state: memberData } = useAsyncState(
  () => villageId.value ? getVillageMembers(villageId.value) : Promise.resolve([]),
  { immediate: true, onError: null }
)

const member = computed(() => {
  if (!person.value) return null
  const memberRecord = memberData.value?.find(m => m.personId === personId.value)
  return { ...person.value, ...memberRecord }
})
</script>

<template>
  <div class="member-detail">
    <PersonDetailCard v-if="member" :person="member" person-type="member" />
  </div>
</template>

<style scoped>
.member-detail {
  padding: 2rem;
}
</style>
