<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import Button from 'primevue/button'
import { getPerson, getCapabilities, getVettingTypes } from '../api/personApi.js'
import { putVolunteer, patchVolunteer, deleteVolunteer } from '../api/roleApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import VolunteerFormFields from './VolunteerFormFields.vue'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const personId = computed(() => route.params.personId)

const person = ref(null)
const hasVolunteer = ref(false)
const hasHomeVillage = computed(() => !!person.value?.village?.villageId)

const capabilityOptions = ref([])   // [{ capabilityId, name }] from getCapabilities()
const villageOptions = ref([])      // [{ villageId, name }] from getVillages()
const vettingTypeOptions = ref([])  // [{ vettingTypeId, name }] from getVettingTypes()
const selectedCapabilityIds = ref([])
const selectedAssociateVillageIds = ref([])
const providerType = ref('')
const active = ref(true)
const notes = ref('')
const vettings = ref([])

async function loadVillageOptions () {
  villageOptions.value = await getVillages(true)
}

onMounted(async () => {
  capabilityOptions.value = await getCapabilities()
  vettingTypeOptions.value = await getVettingTypes()
  await loadVillageOptions()
  const p = await getPerson(personId.value, ['volunteerDetail'])
  person.value = p
  if (p.volunteerDetail) {
    hasVolunteer.value = true
    const d = p.volunteerDetail
    // volunteerDetail.capabilities are names; map to ids via capabilityOptions
    const nameToId = new Map(capabilityOptions.value.map(c => [c.name, c.capabilityId]))
    selectedCapabilityIds.value = (d.capabilities ?? []).map(n => nameToId.get(n)).filter(Boolean)
    selectedAssociateVillageIds.value = (d.associateVillages ?? []).map(v => v.villageId)
    providerType.value = d.providerType ?? ''
    active.value = d.active ?? true
    notes.value = d.notes ?? ''
    vettings.value = d.vettings ?? []
  }
})

async function save () {
  const body = {
    providerType: providerType.value || null,
    active: active.value,
    notes: notes.value || null,
    capabilityIds: selectedCapabilityIds.value,
    associateVillageIds: selectedAssociateVillageIds.value,
    vettings: vettings.value.map(({ vettingTypeId, dateEntered, dateExpired }) => ({ vettingTypeId, dateEntered, dateExpired })),
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
  <Card class="detail-card">
    <template #title>Volunteer Role — {{ person?.fullName }}</template>
    <template #content>
      <div v-if="!hasHomeVillage" class="notice">
        Set a home village on the person before granting a volunteer role.
        <Button label="Back" severity="secondary" @click="back" />
      </div>

      <form v-else @submit.prevent="save">
        <VolunteerFormFields
          v-model:providerType="providerType"
          v-model:active="active"
          v-model:notes="notes"
          v-model:selectedCapabilityIds="selectedCapabilityIds"
          v-model:selectedAssociateVillageIds="selectedAssociateVillageIds"
          v-model:vettings="vettings"
          :capability-options="capabilityOptions"
          :village-options="villageOptions"
          :vetting-type-options="vettingTypeOptions"
          show-vettings
        />

        <div class="form-footer">
          <Button v-if="hasVolunteer" type="button" label="Revoke Role" severity="danger" @click="revoke" />
          <Button type="button" label="Cancel" severity="secondary" @click="back" />
          <Button type="submit" :label="hasVolunteer ? 'Save' : 'Grant Volunteer Role'" />
        </div>
      </form>
    </template>
  </Card>
</template>

<style scoped>
.detail-card {
  max-width: 1100px;
  border: 1px solid var(--color-border-default);
  box-shadow: var(--box-shadow-card);
}

:deep(.p-card-title) {
  font-weight: 700;
  font-size: 2rem;
}

:deep(.p-card-content) {
  display: block;
}

.notice {
  padding: 1rem;
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: flex-start;
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border-default);
}
</style>
