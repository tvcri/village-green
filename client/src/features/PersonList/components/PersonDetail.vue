<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { apiCall } from '../../../shared/api/apiClient.js'
import PersonDetailCard from '../../../shared/components/PersonDetailCard.vue'
import { deletePerson } from '../api/personApi.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()
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

const flatPerson = computed(() => {
  if (!person.value) return null
  const { memberInfo, volunteerInfo, ...rest } = person.value
  return { ...rest, ...memberInfo, ...volunteerInfo }
})

function goEdit () { router.push({ name: 'meta-person-edit', params: { personId: personId.value } }) }

async function removePerson () {
  if (!confirm('Delete this person? This cannot be undone.')) return
  try {
    await deletePerson(personId.value)
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Person deleted', life: 2000 })
    router.push({ name: 'meta-persons' })
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete person', life: 3000 })
  }
}
</script>

<template>
  <div class="person-detail">
    <div class="actions" style="display:flex;gap:0.5rem;margin-bottom:1rem;">
      <Button label="Edit Person" icon="pi pi-pencil" @click="goEdit" />
      <Button label="Delete" icon="pi pi-trash" severity="danger" @click="removePerson" />
    </div>
    <PersonDetailCard v-if="flatPerson" :person="flatPerson" :person-type="personType" />
  </div>
</template>

<style scoped>
.person-detail {
  padding: 2rem;
}
</style>
