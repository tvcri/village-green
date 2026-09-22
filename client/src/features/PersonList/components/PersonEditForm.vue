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
  getCircles, getDisabilities,
} from '../api/personApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { useRequirePermission } from '../../../shared/composables/useRequirePermission.js'
import { useCurrentUser } from '../../../shared/composables/useCurrentUser.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
useRequirePermission('person:write')
const { hasPermission } = useCurrentUser()

const isEdit = computed(() => !!route.params.personId)
const personId = computed(() => route.params.personId)

const form = reactive({
  firstName: '', middleInitial: '', lastName: '', nickname: '',
  street: '', unit: '', city: '', state: '', zip: '', town: '',
  email: '', phone: '', cell: '', birthDate: '',
  emergencyContactName: '', emergencyContactRelationship: '',
  emergencyContactPhone: '', emergencyContactEmail: '',
  villageId: null,
})

// person:read_birth_date governs the input too (spec §4.11): a coordinator
// who cannot see the value must not send null for it on save.
const showBirthDate = computed(() => hasPermission('person:read_birth_date', form.villageId))

const errors = reactive({})
const fields = ref(null)

const villages = ref([])          // [{ villageId, name }]
const allCircles = ref([])        // [{ circleId, name }]
const allDisabilities = ref([])   // [{ disabilityId, name }] from getDisabilities()
const circleNameToId = computed(() =>
  new Map(allCircles.value.map(c => [c.name, c.circleId])))
const disabilityNameToId = computed(() =>
  new Map(allDisabilities.value.map(d => [d.name, d.disabilityId])))
const circleNames = ref(new Set())        // Set<circle name>
const disabilities = ref(new Map())       // Map<'Vision'|'Walker'|'Hearing'|'Wheelchair'|'Cane', note>

async function loadVillages () {
  villages.value = await getVillages()
}

onMounted(async () => {
  await loadVillages()
  allCircles.value = await getCircles()             // [{ circleId, name }]
  allDisabilities.value = await getDisabilities()   // [{ disabilityId, name }]
  if (isEdit.value) {
    const p = await getPerson(personId.value, [])
    Object.keys(form).forEach(k => { if (p[k] !== undefined && p[k] !== null) form[k] = p[k] })
    form.villageId = p.village?.villageId ?? null
    circleNames.value = new Set(p.circles.map(c => c.name))
    disabilities.value = new Map(p.disabilities.map(d => [d.name, d.note]))
  }
})

function buildPayload () {
  const payload = {}
  Object.entries(form).forEach(([k, v]) => {
    if (k === 'villageId') return
    if (k === 'birthDate' && !showBirthDate.value) return
    if (v === '') {
      // On edit, send null so a cleared field is actually cleared server-side
      // instead of being omitted (and thus left at its prior value).
      if (isEdit.value) payload[k] = null
    }
    else if (v !== null) payload[k] = v
  })
  payload.villageId = form.villageId ?? null   // explicit null clears home village
  payload.circles = [...circleNames.value]
    .map(n => circleNameToId.value.get(n))
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
    // An edited address may have a municipality lookup still in flight (or,
    // for an Enter-key submit, not yet started) — settle it before reading
    // form.town into the payload.
    await fields.value?.townSettled()
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
  catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save person', life: 3000 })
  }
}

function toggleCircle (name, checked) {
  if (checked) circleNames.value.add(name)
  else circleNames.value.delete(name)
  circleNames.value = new Set(circleNames.value)
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
          :errors="errors"
          :villages="villages"
          :circles="allCircles"
          :circleNames="circleNames"
          :disabilities="disabilities"
          :show-birth-date="showBirthDate"
          @toggle-circle="toggleCircle"
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

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border-default);
}
</style>
