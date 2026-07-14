<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Select from 'primevue/select'
import PersonFormFields from '../../PersonList/components/PersonFormFields.vue'
import VolunteerFormFields from '../../PersonList/components/VolunteerFormFields.vue'
import { validatePersonForm } from '../../PersonList/lib/personFormValidation.js'
import {
  mapVolunteerPersonForm, volunteerPersonCommunityNames, volunteerCapabilityNames,
  uncertainMapForVolunteerPerson, buildPersonCreatePayload,
} from '../lib/importMapping.js'
import {
  getPersons, createPerson, patchPerson, getCommunities, getDisabilities, getCapabilities,
} from '../../PersonList/api/personApi.js'
import { putVolunteer, patchVolunteer } from '../../PersonList/api/roleApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'

const props = defineProps({
  extraction: { type: Object, required: true },
})
const emit = defineEmits(['volunteer-done'])
const toast = useToast()

const form = reactive(mapVolunteerPersonForm(props.extraction))
const errors = reactive({})
const uncertain = reactive(uncertainMapForVolunteerPerson(props.extraction))
const communityNames = ref(volunteerPersonCommunityNames(props.extraction))
const disabilities = ref(new Map())        // this form has no accessibility section
const villages = ref([])
const allCommunities = ref([])
const allDisabilities = ref([])
const allCapabilities = ref([])
const duplicates = ref([])
const saving = ref(false)
const needsVillage = ref(false)
const selectedVillageId = ref(null)
const savingVillage = ref(false)

const selectedCapabilityIds = ref([])
const providerType = ref('Non-member Volunteer')
const active = ref(true)
const notes = ref(props.extraction.notes ?? '')

const communityNameToId = computed(() =>
  new Map(allCommunities.value.map(c => [c.name, c.communityId])))
const capabilityNameToId = computed(() =>
  new Map(allCapabilities.value.map(c => [c.name, c.capabilityId])))

onMounted(async () => {
  try {
    villages.value = await getVillages()
    allCommunities.value = await getCommunities()
    allDisabilities.value = await getDisabilities()
    allCapabilities.value = await getCapabilities()
    selectedCapabilityIds.value = [...volunteerCapabilityNames(props.extraction)]
      .map(n => capabilityNameToId.value.get(n))
      .filter(Boolean)
    await findDuplicates()
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load form data — go back and retry', life: 3000 })
  }
})

async function findDuplicates () {
  const p = props.extraction.person
  const queries = []
  if (p.lastName) queries.push(getPersons({ lastName: p.lastName }))
  if (p.email) queries.push(getPersons({ email: p.email }))
  const results = (await Promise.all(queries)).flat()
  const byId = new Map(results.map(person => [person.personId, person]))
  duplicates.value = [...byId.values()]
}

function onEdited (field) {
  delete uncertain[field]
}

function toggleCommunity (name, checked) {
  const next = new Set(communityNames.value)
  if (checked) next.add(name)
  else next.delete(name)
  communityNames.value = next
}

async function grantVolunteerRole (personId, { isExisting = false } = {}) {
  const body = {
    providerType: providerType.value || null,
    active: active.value,
    notes: notes.value || null,
    capabilityIds: selectedCapabilityIds.value,
    associateVillageIds: [],
  }
  try {
    // For an existing person, patch so fields the wizard doesn't collect
    // (e.g. vettings) are left untouched rather than wiped by a full replace.
    if (isExisting) await patchVolunteer(personId, body)
    else await putVolunteer(personId, body)
    emit('volunteer-done', {
      personId: createdPersonId,
      fullName: [form.firstName, form.lastName].filter(Boolean).join(' '),
    })
  }
  catch (err) {
    if (err?.status === 422) {
      needsVillage.value = true
    }
    else {
      toast.add({ severity: 'error', summary: 'Error', detail: err?.body?.error ?? 'Failed to save volunteer role', life: 4000 })
    }
  }
}

let createdPersonId = null
let createdPersonIsExisting = false

async function useExisting (person) {
  createdPersonId = person.personId
  createdPersonIsExisting = true
  saving.value = true
  await grantVolunteerRole(person.personId, { isExisting: true })
  saving.value = false
}

async function saveVillageAndRetry () {
  if (!selectedVillageId.value || !createdPersonId) return
  savingVillage.value = true
  try {
    await patchPerson(createdPersonId, { villageId: selectedVillageId.value })
    needsVillage.value = false
    await grantVolunteerRole(createdPersonId, { isExisting: createdPersonIsExisting })
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: err?.body?.error ?? 'Failed to save village', life: 4000 })
  }
  finally {
    savingVillage.value = false
  }
}

async function submit () {
  if (!validatePersonForm(form, errors)) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Please fix the highlighted fields', life: 3000 })
    return
  }
  saving.value = true
  try {
    const payload = buildPersonCreatePayload(form)
    payload.communities = [...communityNames.value]
      .map(n => communityNameToId.value.get(n))
      .filter(Boolean)
    payload.disabilities = []
    const created = await createPerson(payload)
    createdPersonId = created.personId
    createdPersonIsExisting = false
    await grantVolunteerRole(created.personId)
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to create person', life: 3000 })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <Message v-if="duplicates.length" severity="warn" :closable="false">
      <p>Possible existing matches — using one skips person creation:</p>
      <ul class="dup-list">
        <li v-for="p in duplicates" :key="p.personId">
          {{ p.fullName }} <span v-if="p.village?.name">({{ p.village.name }})</span>
          <Button label="Use This Person" size="small" link @click="useExisting(p)" />
        </li>
      </ul>
    </Message>

    <Message v-if="needsVillage" severity="warn" :closable="false">
      <div class="village-fix">
        <p>This person needs a home village before a volunteer role can be granted.</p>
        <Select
          v-model="selectedVillageId"
          :options="villages" optionLabel="name" optionValue="villageId"
          placeholder="Select a village" class="w-full"
        />
        <Button label="Save Village & Retry" size="small" :loading="savingVillage"
          :disabled="!selectedVillageId" @click="saveVillageAndRetry" />
      </div>
    </Message>

    <form @submit.prevent="submit">
      <PersonFormFields
        :form="form" :errors="errors" :uncertain="uncertain"
        :villages="villages" :communityNames="communityNames" :disabilities="disabilities"
        @edited="onEdited" @toggle-community="toggleCommunity"
      />
      <VolunteerFormFields
        v-model:providerType="providerType"
        v-model:active="active"
        v-model:notes="notes"
        v-model:selectedCapabilityIds="selectedCapabilityIds"
        :selected-associate-village-ids="[]"
        :capability-options="allCapabilities"
        :village-options="villages"
      />
      <div class="step-footer">
        <Button type="submit" label="Create Person & Grant Volunteer Role" :loading="saving" />
      </div>
    </form>
  </div>
</template>

<style scoped>
.dup-list { margin: 0.5rem 0 0; padding-left: 1.25rem; }
.step-footer { display: flex; justify-content: flex-end; margin-top: 1.5rem; }
.village-fix { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; margin-top: 0.5rem; }
.village-fix .w-full { width: 100%; max-width: 320px; }
</style>
