<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
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
const providerType = ref('')
const active = ref(true)
const vettings = ref([])

const providerTypeOptions = [
  'Non-member Volunteer',
  'Member Volunteer'
].map(t => ({ label: t, value: t }))

async function loadVillageOptions () {
  villageOptions.value = await getVillages(true)
}

onMounted(async () => {
  capabilityOptions.value = await getCapabilities()
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
    vettings.value = d.vettings ?? []
  }
})

async function save () {
  const body = {
    providerType: providerType.value || null,
    active: active.value,
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
  <Card class="detail-card">
    <template #title>Volunteer Role — {{ person?.fullName }}</template>
    <template #content>
      <div v-if="!hasHomeVillage" class="notice">
        Set a home village on the person before granting a volunteer role.
        <Button label="Back" severity="secondary" @click="back" />
      </div>

      <form v-else @submit.prevent="save">
        <div class="section">
          <h3 class="section-header">Provider</h3>

          <div class="form-field">
            <label class="label" for="providerType">Provider Type</label>
            <Select id="providerType" v-model="providerType" :options="providerTypeOptions"
                    optionLabel="label" optionValue="value" placeholder="Select provider type" class="w-full" />
          </div>

          <div class="form-field checkbox-field">
            <label class="checkbox-item">
              <Checkbox v-model="active" binary />
              <span class="checkbox-label">Active</span>
            </label>
          </div>

          <div class="form-field span-2">
            <label class="label" for="associateVillages">Associate Villages</label>
            <MultiSelect id="associateVillages" v-model="selectedAssociateVillageIds" :options="villageOptions"
                         optionLabel="name" optionValue="villageId" display="chip" placeholder="Select villages" class="w-full" />
          </div>

          <div class="form-field span-4">
            <label class="label" for="capabilities">Capabilities</label>
            <MultiSelect id="capabilities" v-model="selectedCapabilityIds" :options="capabilityOptions"
                         optionLabel="name" optionValue="capabilityId" display="chip" placeholder="Select capabilities" class="w-full" />
          </div>
        </div>

        <div v-if="hasVolunteer" class="section">
          <h3 class="section-header">Vettings</h3>
          <div class="form-field span-4">
            <DataTable :value="vettings" size="small">
              <Column field="name" header="Type"></Column>
              <Column field="dateEntered" header="Date Entered"></Column>
              <Column field="dateExpired" header="Date Expired"></Column>
              <template #empty>No vettings on record.</template>
            </DataTable>
          </div>
        </div>

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

.section {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem 1.5rem;
  margin-top: 2rem;
  margin-bottom: 2rem;
}

.section:first-of-type {
  margin-top: 1rem;
}

.section:last-child {
  margin-bottom: 0;
}

.section-header {
  grid-column: 1 / -1;
  margin: 0 0 0.75rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--p-primary-600);
  border-bottom: 2px solid var(--color-border-default);
  padding-bottom: 0.75rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-field.span-2 {
  grid-column: span 2;
}

.form-field.span-4 {
  grid-column: 1 / -1;
}

.label {
  font-weight: 600;
  color: var(--color-text-dim);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.w-full {
  width: 100%;
}

.checkbox-field {
  justify-content: flex-end;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-label {
  font-size: 1rem;
  color: var(--color-text-primary);
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border-default);
}

@media (max-width: 900px) {
  .section {
    grid-template-columns: 1fr 1fr;
  }
  .form-field.span-2,
  .form-field.span-4 {
    grid-column: span 2;
  }
}

@media (max-width: 600px) {
  .section {
    grid-template-columns: 1fr;
  }
  .form-field.span-2,
  .form-field.span-4 {
    grid-column: span 1;
  }
}
</style>
