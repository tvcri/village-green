<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { apiCall } from '../../../shared/api/apiClient.js'
import PersonDetailCard from '../../../shared/components/PersonDetailCard.vue'
import { deletePerson } from '../api/personApi.js'
import { useCurrentUser } from '../../../shared/composables/useCurrentUser.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { hasPermission } = useCurrentUser()
const canWritePerson = computed(() => hasPermission('person:write'))
const canWriteMember = computed(() => hasPermission('member:write'))
const canWriteVolunteer = computed(() => hasPermission('volunteer:write'))
const personId = computed(() => route.params.personId)

const { state: person } = useAsyncState(
  () => apiCall('getPerson', { personId: personId.value, projection: ['member', 'volunteer'] }),
  { immediate: true }
)

const isMember = computed(() => (person.value?.activeAs ?? []).includes('member'))
const isVolunteer = computed(() => (person.value?.activeAs ?? []).includes('volunteer'))

const personType = computed(() => {
  if (isMember.value && isVolunteer.value) return 'member, volunteer'
  if (isVolunteer.value) return 'volunteer'
  return 'member'
})

// Section visibility should reflect whether the detail data exists, not
// whether the role is currently active (a volunteer can be inactive but
// still have vettings/capabilities on record).
const hasMemberDetail = computed(() => !!person.value?.member)
const hasVolunteerDetail = computed(() => !!person.value?.volunteer)

const canDelete = computed(() => !(person.value?.activeAs ?? []).length)

const flatPerson = computed(() => {
  if (!person.value) return null
  const { member, volunteer, ...rest } = person.value
  return { ...rest, ...member, ...volunteer }
})

function goEdit () { router.push({ name: 'meta-person-edit', params: { personId: personId.value } }) }
function goMember () { router.push({ name: 'meta-person-member', params: { personId: personId.value } }) }
function goVolunteer () { router.push({ name: 'meta-person-volunteer', params: { personId: personId.value } }) }

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
      <Button v-if="canWritePerson" label="Edit Person" icon="pi pi-pencil" @click="goEdit" />
      <Button v-if="canWriteMember" label="Member" icon="pi pi-id-card" :severity="hasMemberDetail ? undefined : 'secondary'" @click="goMember" />
      <Button v-if="canWriteVolunteer" label="Volunteer" icon="pi pi-users" :severity="hasVolunteerDetail ? undefined : 'secondary'" @click="goVolunteer" />
      <span v-if="canWritePerson" style="margin-left:auto;" v-tooltip.top="canDelete ? null : 'Remove member and volunteer roles before deleting this person'">
        <Button label="Delete" icon="pi pi-trash" severity="danger" :disabled="!canDelete" @click="removePerson" />
      </span>
    </div>
    <PersonDetailCard
      v-if="flatPerson"
      :person="flatPerson"
      :person-type="personType"
      :has-member-detail="hasMemberDetail"
      :has-volunteer-detail="hasVolunteerDetail"
      detail-level="full"
    />
  </div>
</template>

<style scoped>
.person-detail {
  padding: 2rem;
}
</style>
