<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getPerson } from '../../PersonList/api/personApi.js'
import PersonDetailCard from '../../../shared/components/PersonDetailCard.vue'

const route = useRoute()

const personId = computed(() => route.params.personId)

// getPerson returns the full person (flat phone/cell) plus member attributes
// via the memberInfo projection. Flatten memberInfo so PersonDetailCard can
// read memberNumber/memberLevel/etc. directly.
const { state: person } = useAsyncState(
  () => getPerson(personId.value, ['memberInfo']),
  { immediate: true, onError: null }
)

const member = computed(() => {
  if (!person.value) return null
  const { memberInfo, ...rest } = person.value
  return { ...rest, ...memberInfo }
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
