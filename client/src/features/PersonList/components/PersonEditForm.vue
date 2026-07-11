<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import Button from 'primevue/button'
import PersonFormFields from './PersonFormFields.vue'
import { validatePersonForm } from '../lib/personFormValidation.js'
import {
  getPerson, createPerson, patchPerson,
  getCommunities, getDisabilities,
} from '../api/personApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { useRequirePermission } from '../../../shared/composables/useRequirePermission.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
useRequirePermission('person:write')

const isEdit = computed(() => !!route.params.personId)
const personId = computed(() => route.params.personId)

const form = reactive({
  firstName: '', middleInitial: '', lastName: '', nickname: '',
  street: '', unit: '', city: '', state: '', zip: '',
  email: '', phone: '', cell: '', birthDate: '',
  emergencyContactName: '', emergencyContactRelationship: '',
  emergencyContactPhone: '', emergencyContactEmail: '',
  villageId: null,
})

const errors = reactive({})

const villages = ref([])          // [{ villageId, name }]
const allCommunities = ref([])    // [{ communityId, name }] from getCommunities()
const allDisabilities = ref([])   // [{ disabilityId, name }] from getDisabilities()
const communityNameToId = computed(() =>
  new Map(allCommunities.value.map(c => [c.name, c.communityId])))
const disabilityNameToId = computed(() =>
  new Map(allDisabilities.value.map(d => [d.name, d.disabilityId])))
const communityNames = ref(new Set())     // Set<'Pride'|'Veteran'>
const disabilities = ref(new Map())       // Map<'Vision'|'Walker'|'Hearing'|'Wheelchair'|'Cane', note>

async function loadVillages () {
  villages.value = await getVillages(true)
}

onMounted(async () => {
  await loadVillages()
  allCommunities.value = await getCommunities()     // [{ communityId, name }]
  allDisabilities.value = await getDisabilities()   // [{ disabilityId, name }]
  if (isEdit.value) {
    const p = await getPerson(personId.value, [])
    Object.keys(form).forEach(k => { if (p[k] !== undefined && p[k] !== null) form[k] = p[k] })
    form.villageId = p.village?.villageId ?? null
    communityNames.value = new Set(p.communities.map(c => c.name))
    disabilities.value = new Map(p.disabilities.map(d => [d.name, d.note]))
  }
})

function buildPayload () {
  const payload = {}
  Object.entries(form).forEach(([k, v]) => {
    if (k === 'villageId') return
    if (v === '') {
      // On edit, send null so a cleared field is actually cleared server-side
      // instead of being omitted (and thus left at its prior value).
      if (isEdit.value) payload[k] = null
    }
    else if (v !== null) payload[k] = v
  })
  payload.villageId = form.villageId ?? null   // explicit null clears home village
  payload.communities = [...communityNames.value]
    .map(n => communityNameToId.value.get(n))
    .filter(Boolean)
  payload.disabilities = [...disabilities.value.entries()].map(([n, note]) => ({
    disabilityId: disabilityNameToId.value.get(n),
    note: note || null,
  }))
  return payload
}

async function handleSubmit () {
  if (!validatePersonForm(form, errors)) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Please fix the highlighted fields', life: 3000 })
    return
  }
  try {
    let id = personId.value
    if (isEdit.value) {
      await patchPerson(id, buildPayload())
    }
    else {
      const created = await createPerson(buildPayload())
      id = created.personId
    }
    toast.add({ severity: 'success', summary: 'Saved', detail: isEdit.value ? 'Person updated' : 'Person created', life: 2000 })
    router.push({ name: 'meta-person-detail', params: { personId: id } })
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save person', life: 3000 })
  }
}

function toggleCommunity (name, checked) {
  if (checked) communityNames.value.add(name)
  else communityNames.value.delete(name)
  communityNames.value = new Set(communityNames.value)
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

function cancel () {
  router.push(isEdit.value
    ? { name: 'meta-person-detail', params: { personId: personId.value } }
    : { name: 'meta-persons' })
}
</script>

<template>
  <Card class="detail-card">
    <template #title>{{ isEdit ? 'Edit Person' : 'Create Person' }}</template>
    <template #content>
      <form @submit.prevent="handleSubmit">

        <PersonFormFields
          :form="form"
          :errors="errors"
          :villages="villages"
          :communityNames="communityNames"
          :disabilities="disabilities"
          @toggle-community="toggleCommunity"
          @toggle-disability="toggleDisability"
          @edit-disability-note="editDisabilityNote"
        />

        <!-- Footer: Save / Cancel buttons -->
        <div class="form-footer">
          <Button type="button" label="Cancel" severity="secondary" @click="cancel" />
          <Button type="submit" label="Save" />
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

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border-default);
}
</style>
