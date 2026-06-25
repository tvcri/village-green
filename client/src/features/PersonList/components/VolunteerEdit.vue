<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import MultiSelect from 'primevue/multiselect'
import Button from 'primevue/button'
import { getPerson, getCapabilities } from '../api/personApi.js'
import { putVolunteer, patchVolunteer, deleteVolunteer } from '../api/roleApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const personId = computed(() => route.params.personId)

const person = ref(null)
const hasVolunteer = ref(false)
const hasHomeVillage = computed(() => !!person.value?.village?.villageId)

const capabilityOptions = ref([])   // [{ capabilityId, name }] from getCapabilities()
const villageOptions = ref([])      // [{ villageId, name }] from getVillages()
const selectedCapabilityIds = ref([])
const selectedAssociateVillageIds = ref([])

async function loadVillageOptions () {
  villageOptions.value = await getVillages(true)
}

onMounted(async () => {
  capabilityOptions.value = await getCapabilities()
  await loadVillageOptions()
  const p = await getPerson(personId.value, ['volunteerInfo'])
  person.value = p
  if (p.volunteerInfo) {
    hasVolunteer.value = true
    // volunteerInfo.capabilities are names; map to ids via capabilityOptions
    const nameToId = new Map(capabilityOptions.value.map(c => [c.name, c.capabilityId]))
    selectedCapabilityIds.value = (p.volunteerInfo.capabilities ?? []).map(n => nameToId.get(n)).filter(Boolean)
    selectedAssociateVillageIds.value = (p.volunteerInfo.associateVillages ?? []).map(v => v.villageId)
  }
})

async function save () {
  const body = {
    capabilityIds: selectedCapabilityIds.value,
    associateVillageIds: selectedAssociateVillageIds.value,
  }
  try {
    if (hasVolunteer.value) await patchVolunteer(personId.value, body)
    else await putVolunteer(personId.value, body)
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Volunteer role saved', life: 2000 })
    back()
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save volunteer role', life: 3000 })
  }
}

async function revoke () {
  try {
    await deleteVolunteer(personId.value)
    toast.add({ severity: 'success', summary: 'Revoked', detail: 'Volunteer role revoked', life: 2000 })
    back()
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to revoke', life: 3000 })
  }
}

function back () { router.push({ name: 'meta-person-detail', params: { personId: personId.value } }) }
</script>

<template>
  <div style="padding:2rem;max-width:700px;">
    <h2>Volunteer Role — {{ person?.fullName }}</h2>

    <div v-if="!hasHomeVillage" class="notice">
      Set a home village on the person before granting a volunteer role.
      <Button label="Back" severity="secondary" @click="back" />
    </div>

    <form v-else style="display:flex;flex-direction:column;gap:1rem;" @submit.prevent="save">
      <label>Capabilities
        <MultiSelect v-model="selectedCapabilityIds" :options="capabilityOptions"
                     optionLabel="name" optionValue="capabilityId" display="chip" placeholder="Select capabilities" />
      </label>
      <label>Associate Villages
        <MultiSelect v-model="selectedAssociateVillageIds" :options="villageOptions"
                     optionLabel="name" optionValue="villageId" display="chip" placeholder="Select villages" />
      </label>
      <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
        <Button v-if="hasVolunteer" type="button" label="Revoke Role" severity="danger" @click="revoke" />
        <Button type="button" label="Cancel" severity="secondary" @click="back" />
        <Button type="submit" :label="hasVolunteer ? 'Save' : 'Grant Volunteer Role'" />
      </div>
    </form>
  </div>
</template>

<style scoped>
.notice { padding:1rem;border:1px solid var(--color-border-default);border-radius:6px;display:flex;flex-direction:column;gap:1rem;align-items:flex-start; }
</style>
