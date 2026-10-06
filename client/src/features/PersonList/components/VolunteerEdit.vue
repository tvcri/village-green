<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import Button from 'primevue/button'
import { getPerson, getCapabilities, getVettingTypes, getCircles } from '../api/personApi.js'
import { putVolunteer, patchVolunteer, deleteVolunteer } from '../api/roleApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { getTrainings } from '../../Trainings/api/trainingApi.js'
import { getPositions } from '../../Positions/api/positionApi.js'
import VolunteerFormFields from './VolunteerFormFields.vue'
import VolunteerTrainingsFields from './VolunteerTrainingsFields.vue'
import VolunteerPositionsFields from './VolunteerPositionsFields.vue'
import { isPositionEligible } from '../../../shared/lib/positionRules.js'
import { useRequirePermission } from '../../../shared/composables/useRequirePermission.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
useRequirePermission('volunteer:write')
const personId = computed(() => route.params.personId)

const person = ref(null)
const hasVolunteer = ref(false)
// A person with no home village is a Hub volunteer: the role is allowed.
// Person.village carries name with villageId; the villageOptions lookup is a
// fallback so the help text never reads "undefined (home)".
const homeVillage = computed(() => {
  const v = person.value?.village
  if (!v?.villageId) return null
  const name = v.name ?? villageOptions.value.find(o => String(o.villageId) === String(v.villageId))?.name ?? null
  return { villageId: v.villageId, name }
})

const capabilityOptions = ref([])   // [{ capabilityId, name }] from getCapabilities()
const villageOptions = ref([])      // [{ villageId, name }] from getVillages()
const vettingTypeOptions = ref([])  // [{ vettingTypeId, name }] from getVettingTypes()
const selectedCapabilityIds = ref([])
const selectedAssociateVillageIds = ref([])
const providerType = ref('')
const active = ref(true)
const notes = ref('')
const vettings = ref([])
const trainingOptions = ref([])     // [{ trainingId, name }]
const positionOptions = ref([])     // [{ positionId, name, scope, trainingIds }]
const circleOptions = ref([])       // [{ circleId, name }]
const trainings = ref([])           // [{ trainingId, name, completedDate, notes }]
const positions = ref([])           // [{ positionId, name, scope, villageId, villageName, circleId, circleName }]

onMounted(async () => {
  try {
    const [capabilities, vettingTypes, villages, trainingList, positionList, circles] = await Promise.all([
      getCapabilities(), getVettingTypes(), getVillages(), getTrainings(), getPositions(), getCircles(),
    ])
    capabilityOptions.value = capabilities
    vettingTypeOptions.value = vettingTypes
    villageOptions.value = villages
    trainingOptions.value = trainingList
    positionOptions.value = positionList
    circleOptions.value = circles
    const p = await getPerson(personId.value, ['volunteer'])
    person.value = p
    if (p.volunteer) {
      hasVolunteer.value = true
      const d = p.volunteer
      // volunteer.capabilities are names; map to ids via capabilityOptions
      const nameToId = new Map(capabilityOptions.value.map(c => [c.name, c.capabilityId]))
      selectedCapabilityIds.value = (d.capabilities ?? []).map(n => nameToId.get(n)).filter(Boolean)
      selectedAssociateVillageIds.value = (d.associateVillages ?? []).map(v => v.villageId)
      providerType.value = d.providerType ?? ''
      active.value = d.active ?? true
      notes.value = d.notes ?? ''
      vettings.value = d.vettings ?? []
      // key/sortDate: stable row identity and order for VolunteerTrainingsFields; never sent.
      trainings.value = (d.trainings ?? []).map(t => ({
        key: `vt${t.volunteerTrainingId}`, sortDate: t.completedDate,
        trainingId: t.trainingId, name: t.name, completedDate: t.completedDate, notes: t.notes,
      }))
      positions.value = (d.positions ?? []).map(r => ({
        positionId: r.positionId, name: r.name, scope: r.scope,
        villageId: r.village?.villageId ?? null, villageName: r.village?.name ?? null,
        circleId: r.circle?.circleId ?? null, circleName: r.circle?.name ?? null,
      }))
    }
  }
  catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load person', life: 3000 })
  }
})

async function save () {
  // A village position the home and associate villages no longer cover would
  // 422 the whole save, so it is left out (and named in the toast). Re-adding
  // the associate village before saving keeps it.
  const homeId = person.value?.village?.villageId ?? null
  const kept = positions.value.filter(r => isPositionEligible({ scope: r.scope, villageId: r.villageId }, homeId, selectedAssociateVillageIds.value))
  const dropped = positions.value.filter(r => !kept.includes(r))
  const body = {
    providerType: providerType.value || null,
    active: active.value,
    notes: notes.value || null,
    capabilityIds: selectedCapabilityIds.value,
    associateVillageIds: selectedAssociateVillageIds.value,
    vettings: vettings.value.map(({ vettingTypeId, dateEntered, dateExpired, additionalData, notes }) => ({ vettingTypeId, dateEntered, dateExpired, additionalData, notes })),
    trainings: trainings.value.map(({ trainingId, completedDate, notes }) => ({ trainingId, completedDate: completedDate ?? null, notes: notes ?? null })),
    positions: kept.map(({ positionId, villageId, circleId }) => ({ positionId, villageId: villageId ?? null, circleId: circleId ?? null })),
  }
  try {
    if (hasVolunteer.value) await patchVolunteer(personId.value, body)
    else await putVolunteer(personId.value, body)
    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: dropped.length ? `Volunteer role saved. Removed ${dropped.map(r => `${r.name}, ${r.villageName}`).join('; ')}.` : 'Volunteer role saved',
      life: dropped.length ? 5000 : 2000,
    })
    back()
  }
  catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save volunteer role', life: 3000 })
  }
}

async function revoke () {
  try {
    await deleteVolunteer(personId.value)
    toast.add({ severity: 'success', summary: 'Revoked', detail: 'Volunteer role revoked', life: 2000 })
    back()
  }
  catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to revoke', life: 3000 })
  }
}

function back () { router.push({ name: 'meta-person-detail', params: { personId: personId.value } }) }
</script>

<template>
  <Card class="detail-card">
    <template #title>Volunteer Role — {{ person?.fullName }}</template>
    <template #content>
      <div v-if="!person" class="notice">Loading…</div>

      <!-- No submit button, so Enter in a text box never saves (browsers only
           submit implicitly when a form has one); @submit.prevent stays as a
           backstop. Save is an ordinary button. -->
      <form v-else @submit.prevent>
        <VolunteerFormFields
          v-model:provider-type="providerType"
          v-model:active="active"
          v-model:notes="notes"
          v-model:selected-capability-ids="selectedCapabilityIds"
          v-model:selected-associate-village-ids="selectedAssociateVillageIds"
          v-model:vettings="vettings"
          :capability-options="capabilityOptions"
          :village-options="villageOptions"
          :vetting-type-options="vettingTypeOptions"
          show-vettings
        />
        <VolunteerTrainingsFields v-model:trainings="trainings" :training-options="trainingOptions" />
        <VolunteerPositionsFields v-model:positions="positions" :position-options="positionOptions" :home-village="homeVillage"
                                  :associate-village-ids="selectedAssociateVillageIds" :village-options="villageOptions"
                                  :circle-options="circleOptions" :trainings="trainings" :training-options="trainingOptions" />

        <div class="form-footer">
          <Button v-if="hasVolunteer" type="button" label="Revoke Role" severity="danger" @click="revoke" />
          <Button type="button" label="Cancel" severity="secondary" @click="back" />
          <Button type="button" :label="hasVolunteer ? 'Save' : 'Grant Volunteer Role'" @click="save" />
        </div>
      </form>
    </template>
  </Card>
</template>

<style scoped>
.detail-card {
  max-width: 1100px;
  margin: 2rem auto;
  border: 1px solid var(--color-border-default);
  box-shadow: var(--box-shadow-card);
}

:deep(.p-card-title) {
  font-weight: 700;
  font-size: 2rem;
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

/* Pinned to the bottom of the viewport while the form scrolls, so Save is
   reachable from anywhere on a long form. */
.form-footer {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding: 0.75rem 0;
  background: var(--p-card-background);
  border-top: 1px solid var(--color-border-default);
}
</style>
