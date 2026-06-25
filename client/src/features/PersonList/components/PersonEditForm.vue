<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import {
  getPerson, createPerson, patchPerson,
  getPersonCommunities, putPersonCommunities, getCommunities,
} from '../api/personApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()

const isEdit = computed(() => !!route.params.personId)
const personId = computed(() => route.params.personId)

const form = reactive({
  fullName: '', firstName: '', lastName: '', nickname: '',
  address: '', city: '', state: '', zip: '',
  email: '', phone: '', cell: '', birthDate: '',
  emergencyContactName: '', emergencyContactRelationship: '',
  emergencyContactPhone: '', emergencyContactEmail: '',
  villageId: null,
})

const villages = ref([])          // [{ villageId, name }]
const allCommunities = ref([])    // [{ communityId, name }] from getCommunities()
const communityNameToId = computed(() =>
  new Map(allCommunities.value.map(c => [c.name, c.communityId])))
const communityNames = ref(new Set())   // Set<'Pride'|'Veteran'>
let originalCommunityNames = new Set()

async function loadVillages () {
  villages.value = await getVillages(true)
}

onMounted(async () => {
  await loadVillages()
  allCommunities.value = await getCommunities()   // [{ communityId, name }]
  if (isEdit.value) {
    const p = await getPerson(personId.value, [])
    Object.keys(form).forEach(k => { if (p[k] !== undefined && p[k] !== null) form[k] = p[k] })
    form.villageId = p.village?.villageId ?? null
    const comms = await getPersonCommunities(personId.value)
    originalCommunityNames = new Set(comms.map(c => c.name))
    communityNames.value = new Set(originalCommunityNames)
  }
})

function buildPayload () {
  const payload = {}
  Object.entries(form).forEach(([k, v]) => {
    if (k === 'villageId') return
    if (v !== '' && v !== null) payload[k] = v
  })
  payload.villageId = form.villageId ?? null   // explicit null clears home village
  return payload
}

async function handleSubmit () {
  if (!form.fullName) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Full name is required', life: 3000 })
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
    // Community: only call if changed. Translate selected names → ids.
    if (communitiesChanged()) {
      await putPersonCommunities(id, communityNamesToIds(communityNames.value))
    }
    toast.add({ severity: 'success', summary: 'Saved', detail: isEdit.value ? 'Person updated' : 'Person created', life: 2000 })
    router.push({ name: 'meta-person-detail', params: { personId: id } })
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save person', life: 3000 })
  }
}

function communitiesChanged () {
  if (communityNames.value.size !== originalCommunityNames.size) return true
  for (const n of communityNames.value) if (!originalCommunityNames.has(n)) return true
  return false
}

function communityNamesToIds (names) {
  return [...names].map(n => communityNameToId.value.get(n)).filter(Boolean)
}

function toggleCommunity (name, checked) {
  if (checked) communityNames.value.add(name)
  else communityNames.value.delete(name)
  communityNames.value = new Set(communityNames.value)
}

function cancel () {
  router.push(isEdit.value
    ? { name: 'meta-person-detail', params: { personId: personId.value } }
    : { name: 'meta-persons' })
}
</script>

<template>
  <div class="person-edit" style="padding:2rem;max-width:900px;">
    <h2>{{ isEdit ? 'Edit Person' : 'Create Person' }}</h2>
    <form class="form" style="display:flex;flex-direction:column;gap:1rem;" @submit.prevent="handleSubmit">
      <label>Full Name <InputText v-model="form.fullName" /></label>
      <label>First Name <InputText v-model="form.firstName" /></label>
      <label>Last Name <InputText v-model="form.lastName" /></label>
      <label>Nickname <InputText v-model="form.nickname" /></label>
      <label>Home Village
        <Select v-model="form.villageId" :options="villages" optionLabel="name" optionValue="villageId"
                placeholder="(no home village)" showClear />
      </label>
      <label>Email <InputText v-model="form.email" /></label>
      <label>Phone <InputText v-model="form.phone" /></label>
      <label>Cell <InputText v-model="form.cell" /></label>
      <label>Address <InputText v-model="form.address" /></label>
      <label>City <InputText v-model="form.city" /></label>
      <label>State <InputText v-model="form.state" /></label>
      <label>Zip <InputText v-model="form.zip" /></label>
      <label>Birth Date <InputText v-model="form.birthDate" placeholder="YYYY-MM-DD" /></label>

      <fieldset>
        <legend>Communities</legend>
        <label><Checkbox :modelValue="communityNames.has('Pride')" binary
                @update:modelValue="v => toggleCommunity('Pride', v)" /> Pride</label>
        <label><Checkbox :modelValue="communityNames.has('Veteran')" binary
                @update:modelValue="v => toggleCommunity('Veteran', v)" /> Veteran</label>
      </fieldset>

      <h3>Emergency Contact</h3>
      <label>Name <InputText v-model="form.emergencyContactName" /></label>
      <label>Relationship <InputText v-model="form.emergencyContactRelationship" /></label>
      <label>Phone <InputText v-model="form.emergencyContactPhone" /></label>
      <label>Email <InputText v-model="form.emergencyContactEmail" /></label>

      <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
        <Button type="button" label="Cancel" severity="secondary" @click="cancel" />
        <Button type="submit" label="Save" />
      </div>
    </form>
  </div>
</template>
