<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Message from 'primevue/message'
import PersonFormFields from '../../PersonList/components/PersonFormFields.vue'
import VolunteerFormFields from '../../PersonList/components/VolunteerFormFields.vue'
import { validatePersonForm } from '../../PersonList/lib/personFormValidation.js'
import {
  mapVolunteerPersonForm, volunteerCapabilityNames,
  uncertainMapForVolunteerPerson, buildPersonCreatePayload,
  buildApplicationEnvelope, personExtrasFields, matchGender,
} from '../lib/importMapping.js'
import { usePersonLookups } from '../../PersonList/composables/usePersonLookups.js'
import { emptyPersonFields, addPersonFields } from '../../PersonList/lib/personPayload.js'
import {
  getPersons, getPerson, createPerson, getDisabilities, getCapabilities,
} from '../../PersonList/api/personApi.js'
import { putVolunteer, patchVolunteer } from '../../PersonList/api/roleApi.js'
import { DECEASED_ROLE_NOTE } from '../../../shared/lib/deceased.js'
import { getVolunteerDropReasons } from '../../Admin/api/dropReasonApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { validateVolunteerForm } from '../../PersonList/lib/volunteerFormValidation.js'
import { dropReasonSent } from '../../PersonList/lib/memberFormValidation.js'
import { useCurrentUser } from '../../../shared/composables/useCurrentUser.js'

const props = defineProps({
  extraction: { type: Object, required: true },
})
const emit = defineEmits(['volunteer-done', 'volunteer-skipped'])
const toast = useToast()
const { hasPermission } = useCurrentUser()

const form = reactive(mapVolunteerPersonForm(props.extraction))
// Checked against the person's village, like PersonEditForm: a village-scoped
// holder must not have the input hidden and the value dropped on submit.
const showBirthDate = computed(() => hasPermission('person:read_birth_date', form.villageId))
const errors = reactive({})
const fields = ref(null)
const uncertain = reactive(uncertainMapForVolunteerPerson(props.extraction))
const disabilities = ref(new Map())        // this form has no accessibility section
const villages = ref([])
const allDisabilities = ref([])
const allCapabilities = ref([])
const duplicates = ref([])
const saving = ref(false)
// The volunteer form has no join question, so the Circles section stays
// hidden and nothing is pre-ticked.
const noCircles = new Set()
const showDemographics = computed(() => hasPermission('person:read_demographics', form.villageId))
const personFields = reactive({ ...emptyPersonFields(), ...personExtrasFields(props.extraction.person) })
const { lookups, ready: lookupsReady } = usePersonLookups()

const selectedCapabilityIds = ref([])
const providerType = ref('Non-member Volunteer')
// A new volunteer starts Pending: recorded from receipt of the application.
// An existing volunteer's stored status replaces this in useExisting.
const status = ref('Pending')
const dropReasonId = ref(null)
const statusChangeNotes = ref('')
const volunteerErrors = reactive({})
const dropReasons = ref([])
// Stored status and reason of an existing volunteer ({} for a new one, where
// Dropped always needs a reason).
const loaded = ref({})
const notes = ref(props.extraction.notes ?? '')

const capabilityNameToId = computed(() =>
  new Map(allCapabilities.value.map(c => [c.name, c.capabilityId])))

onMounted(async () => {
  try {
    villages.value = await getVillages()
    allDisabilities.value = await getDisabilities()
    allCapabilities.value = await getCapabilities()
    await lookupsReady
    const g = matchGender(props.extraction.person?.gender, lookups.genders)
    personFields.genderId = g.genderId
    if (g.uncertain && !uncertain.genderId) uncertain.genderId = g.uncertain
    selectedCapabilityIds.value = [...volunteerCapabilityNames(props.extraction)]
      .map(n => capabilityNameToId.value.get(n))
      .filter(Boolean)
    try { dropReasons.value = await getVolunteerDropReasons() }
    catch { toast.add({ severity: 'warn', summary: 'Drop reasons unavailable', detail: 'A drop reason cannot be chosen right now', life: 3000 }) }
    await findDuplicates()
  }
  catch {
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

// `stored` overrides the form's status fields for an existing volunteer, so
// the form refs stay untouched if the PATCH fails and the coordinator then
// creates a new person from the same form.
async function grantVolunteerRole (personId, { isExisting = false, stored = null } = {}) {
  const eff = stored ?? { status: status.value, dropReasonId: dropReasonId.value, statusChangeNotes: statusChangeNotes.value, loaded: loaded.value }
  const body = {
    providerType: providerType.value || null,
    status: eff.status,
    notes: notes.value || null,
    capabilityIds: selectedCapabilityIds.value,
    application: buildApplicationEnvelope(props.extraction, null),
  }
  if (eff.statusChangeNotes) body.statusChangeNotes = eff.statusChangeNotes
  if (dropReasonSent({ status: eff.status, dropReasonId: eff.dropReasonId }, eff.loaded)) body.dropReasonId = eff.dropReasonId
  // A PATCH that carries associateVillageIds prunes village positions held at
  // associate villages, so an existing person's PATCH must omit it entirely.
  if (!isExisting) body.associateVillageIds = []
  try {
    // For an existing person, patch so fields the wizard doesn't collect
    // (e.g. vettings) are left untouched rather than wiped by a full replace.
    if (isExisting) await patchVolunteer(personId, body)
    else await putVolunteer(personId, body)
    emit('volunteer-done', {
      personId: createdPersonId,
      fullName: createdPersonName,
    })
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: err?.body?.error ?? 'Failed to save volunteer role', life: 4000 })
  }
}

let createdPersonId = null
let createdPersonName = ''   // the stored fullName, suffix included

async function useExisting (person) {
  createdPersonId = person.personId
  createdPersonName = person.fullName
  saving.value = true
  try {
    // An existing volunteer keeps its stored status and reason, passed as
    // overrides so an Active volunteer stays Active.
    const p = await getPerson(person.personId, ['volunteer'])
    const stored = p.volunteer
      ? {
          status: p.volunteer.status,
          dropReasonId: p.volunteer.dropReasonId ?? null,
          statusChangeNotes: p.volunteer.statusChangeNotes ?? '',
        }
      : { status: status.value, dropReasonId: dropReasonId.value, statusChangeNotes: statusChangeNotes.value }
    stored.loaded = p.volunteer ? { status: stored.status, dropReasonId: stored.dropReasonId } : {}
    if (!validateVolunteerForm({ status: stored.status, dropReasonId: stored.dropReasonId }, volunteerErrors, stored.loaded)) {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Please fix the highlighted fields', life: 3000 })
      return
    }
    await grantVolunteerRole(person.personId, { isExisting: true, stored })
  }
  catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load the existing volunteer role', life: 3000 })
  }
  finally {
    saving.value = false
  }
}

async function submit () {
  // A new person has no stored volunteer row, so Dropped always needs a reason.
  loaded.value = {}
  const volunteerOk = validateVolunteerForm({ status: status.value, dropReasonId: dropReasonId.value }, volunteerErrors, loaded.value)
  if (!validatePersonForm(form, errors, { deceased: personFields.deceased, deceasedDate: personFields.deceasedDate, dateUnknown: personFields.dateUnknown }) || !volunteerOk) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Please fix the highlighted fields', life: 3000 })
    return
  }
  saving.value = true
  try {
    // The on-mount municipality lookup for the prefilled address may still be
    // in flight — settle it before the payload reads form.town.
    await fields.value?.townSettled()
    const payload = buildPersonCreatePayload(form)
    if (!showBirthDate.value) delete payload.birthDate
    payload.disabilities = []
    addPersonFields(payload, personFields, { isEdit: false, showDemographics: showDemographics.value })
    const created = await createPerson(payload)
    createdPersonId = created.personId
    createdPersonName = created.fullName
    // A person created as deceased gets no role.
    if (personFields.deceased) {
      emit('volunteer-skipped', { personId: createdPersonId, fullName: createdPersonName })
      return
    }
    await grantVolunteerRole(created.personId)
  }
  catch {
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
          <span v-if="p.deceased" class="dup-deceased">Deceased</span>
          <Button v-else label="Use This Person" size="small" link @click="useExisting(p)" />
        </li>
      </ul>
      <p v-if="duplicates.some(p => p.deceased)">{{ DECEASED_ROLE_NOTE }}</p>
    </Message>

    <form @submit.prevent="submit">
      <PersonFormFields
        ref="fields"
        v-model:first-name="form.firstName"
        v-model:middle-initial="form.middleInitial"
        v-model:last-name="form.lastName"
        v-model:nickname="form.nickname"
        v-model:email="form.email"
        v-model:phone="form.phone"
        v-model:cell="form.cell"
        v-model:street="form.street"
        v-model:unit="form.unit"
        v-model:city="form.city"
        v-model:state="form.state"
        v-model:zip="form.zip"
        v-model:town="form.town"
        v-model:birth-date="form.birthDate"
        v-model:village-id="form.villageId"
        v-model:emergency-contact-name="form.emergencyContactName"
        v-model:emergency-contact-relationship="form.emergencyContactRelationship"
        v-model:emergency-contact-phone="form.emergencyContactPhone"
        v-model:emergency-contact-email="form.emergencyContactEmail"
        :errors="errors" :uncertain="uncertain"
        :villages="villages" :circle-names="noCircles" :disabilities="disabilities"
        :show-birth-date="showBirthDate" :show-circles="false"
        :show-demographics="showDemographics" :lookups="lookups"
        v-model:suffix="personFields.suffix"
        v-model:pronouns="personFields.pronouns"
        v-model:deceased="personFields.deceased"
        v-model:deceased-date="personFields.deceasedDate"
        v-model:date-unknown="personFields.dateUnknown"
        v-model:preferred-contact-method-id="personFields.preferredContactMethodId"
        v-model:gender-id="personFields.genderId"
        v-model:ethnicity-id="personFields.ethnicityId"
        v-model:is-veteran="personFields.isVeteran"
        v-model:race-ids="personFields.raceIds"
        v-model:language-ids="personFields.languageIds"
        v-model:preferred-language-id="personFields.preferredLanguageId"
        @edited="onEdited"
      />
      <VolunteerFormFields
        v-model:provider-type="providerType"
        v-model:status="status"
        v-model:drop-reason-id="dropReasonId"
        v-model:status-change-notes="statusChangeNotes"
        v-model:notes="notes"
        v-model:selected-capability-ids="selectedCapabilityIds"
        :selected-associate-village-ids="[]"
        :capability-options="allCapabilities"
        :village-options="villages"
        :drop-reasons="dropReasons"
        :loaded-drop-reason-id="loaded.dropReasonId"
        :errors="volunteerErrors"
      />
      <div class="step-footer">
        <Button type="submit" :label="personFields.deceased ? 'Create Person' : 'Create Person & Grant Volunteer Role'" :loading="saving" />
      </div>
    </form>
  </div>
</template>

<style scoped>
.dup-list { margin: 0.5rem 0 0; padding-left: 1.25rem; }
.dup-deceased { margin-left: 0.5rem; font-style: italic; }
.step-footer { display: flex; justify-content: flex-end; margin-top: 1.5rem; }
</style>
