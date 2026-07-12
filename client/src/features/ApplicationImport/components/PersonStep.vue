<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Message from 'primevue/message'
import PersonFormFields from '../../PersonList/components/PersonFormFields.vue'
import { validatePersonForm } from '../../PersonList/lib/personFormValidation.js'
import {
  mapPersonForm, personCommunityNames, personDisabilities, uncertainMapForPerson, buildPersonCreatePayload,
} from '../lib/importMapping.js'
import { getPersons, createPerson, getCommunities, getDisabilities } from '../../PersonList/api/personApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'

const props = defineProps({
  extraction: { type: Object, required: true },
  memberIndex: { type: Number, required: true },
})
const emit = defineEmits(['person-done'])
const toast = useToast()

const form = reactive(mapPersonForm(props.extraction, props.memberIndex))
const errors = reactive({})
const uncertain = reactive(uncertainMapForPerson(props.extraction, props.memberIndex))
const communityNames = ref(personCommunityNames(props.extraction, props.memberIndex))
const disabilities = ref(personDisabilities(props.extraction, props.memberIndex))
const villages = ref([])
const allCommunities = ref([])
const allDisabilities = ref([])
const duplicates = ref([])
const saving = ref(false)

const communityNameToId = computed(() =>
  new Map(allCommunities.value.map(c => [c.name, c.communityId])))
const disabilityNameToId = computed(() =>
  new Map(allDisabilities.value.map(d => [d.name, d.disabilityId])))

onMounted(async () => {
  try {
    villages.value = await getVillages()
    allCommunities.value = await getCommunities()
    allDisabilities.value = await getDisabilities()
    await findDuplicates()
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load form data — go back and retry', life: 3000 })
  }
})

async function findDuplicates () {
  const m = props.extraction.members[props.memberIndex]
  const queries = []
  if (m.lastName) queries.push(getPersons({ lastName: m.lastName }))
  if (m.email) queries.push(getPersons({ email: m.email }))
  const results = (await Promise.all(queries)).flat()
  const byId = new Map(results.map(p => [p.personId, p]))
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

function toggleDisability (name, checked) {
  const next = new Map(disabilities.value)
  if (checked) next.set(name, next.get(name) ?? '')
  else next.delete(name)
  disabilities.value = next
}

function editDisabilityNote (name, note) {
  if (!disabilities.value.has(name)) return
  const next = new Map(disabilities.value)
  next.set(name, note)
  disabilities.value = next
}

function useExisting (person) {
  emit('person-done', { personId: person.personId, fullName: person.fullName, existing: true })
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
    payload.disabilities = [...disabilities.value.entries()].map(([n, note]) => ({
      disabilityId: disabilityNameToId.value.get(n),
      note: note || null,
    })).filter(d => d.disabilityId)
    const created = await createPerson(payload)
    emit('person-done', {
      personId: created.personId,
      fullName: [form.firstName, form.lastName].filter(Boolean).join(' '),
      existing: false,
    })
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

    <form @submit.prevent="submit">
      <PersonFormFields
        :form="form" :errors="errors" :uncertain="uncertain"
        :villages="villages" :communityNames="communityNames" :disabilities="disabilities"
        @edited="onEdited" @toggle-community="toggleCommunity"
        @toggle-disability="toggleDisability" @edit-disability-note="editDisabilityNote"
      />
      <div class="step-footer">
        <Button type="submit" :label="`Create Person & Continue`" :loading="saving" />
      </div>
    </form>
  </div>
</template>

<style scoped>
.dup-list { margin: 0.5rem 0 0; padding-left: 1.25rem; }
.step-footer { display: flex; justify-content: flex-end; margin-top: 1.5rem; }
</style>
