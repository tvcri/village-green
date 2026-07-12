<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getPerson } from '../../PersonList/api/personApi.js'
import PersonDetailCard from '../../../shared/components/PersonDetailCard.vue'

const route = useRoute()

const personId = computed(() => route.params.personId)

// getPerson returns the full person (flat phone/cell) plus member attributes
// via the member projection. Flatten it so PersonDetailCard can read
// memberNumber/memberLevel/etc. directly — but only when the member role is
// active: staff callers may receive inactive-role data (read_inactive), and
// this village-context view shows current members only.
const { state: person } = useAsyncState(
  () => getPerson(personId.value, ['member']),
  { immediate: true, onError: null }
)

const member = computed(() => {
  if (!person.value) return null
  const { member: memberData, ...rest } = person.value
  return { ...rest, ...((person.value.roles ?? []).includes('member') ? memberData : null) }
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
