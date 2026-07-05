<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
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
  firstName: '', middleInitial: '', lastName: '', nickname: '',
  street: '', unit: '', city: '', state: '', zip: '',
  email: '', phone: '', cell: '', birthDate: '',
  emergencyContactName: '', emergencyContactRelationship: '',
  emergencyContactPhone: '', emergencyContactEmail: '',
  villageId: null,
})

const errors = reactive({})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[\d\s\-()+]{7,}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ZIP_RE = /^\d{5}$/

function validate () {
  // Clear all current errors
  Object.keys(errors).forEach(k => delete errors[k])

  if (!form.firstName.trim()) errors.firstName = 'First name is required'
  if (!form.lastName.trim())  errors.lastName  = 'Last name is required'

  if (form.email && !EMAIL_RE.test(form.email))
    errors.email = 'Enter a valid email address'
  if (form.emergencyContactEmail && !EMAIL_RE.test(form.emergencyContactEmail))
    errors.emergencyContactEmail = 'Enter a valid email address'

  if (form.phone && !PHONE_RE.test(form.phone))
    errors.phone = 'Enter a valid phone number'
  if (form.cell && !PHONE_RE.test(form.cell))
    errors.cell = 'Enter a valid phone number'
  if (form.emergencyContactPhone && !PHONE_RE.test(form.emergencyContactPhone))
    errors.emergencyContactPhone = 'Enter a valid phone number'

  if (form.birthDate && (!DATE_RE.test(form.birthDate) || isNaN(Date.parse(form.birthDate))))
    errors.birthDate = 'Enter a valid date (YYYY-MM-DD)'

  if (form.zip && !ZIP_RE.test(form.zip))
    errors.zip = 'Zip must be 5 digits'

  return Object.keys(errors).length === 0
}

function clearError (field) {
  delete errors[field]
}

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
    if (v === '') {
      // On edit, send null so a cleared field is actually cleared server-side
      // instead of being omitted (and thus left at its prior value).
      if (isEdit.value) payload[k] = null
    }
    else if (v !== null) payload[k] = v
  })
  payload.villageId = form.villageId ?? null   // explicit null clears home village
  return payload
}

async function handleSubmit () {
  if (!validate()) {
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
  <Card class="detail-card">
    <template #title>{{ isEdit ? 'Edit Person' : 'Create Person' }}</template>
    <template #content>
      <form @submit.prevent="handleSubmit">

        <!-- Personal Information Section -->
        <div class="section">
          <h3 class="section-header">Personal Information</h3>

          <div class="form-field">
            <label class="label" for="firstName">First Name <span class="required">*</span></label>
            <InputText
              id="firstName"
              v-model="form.firstName"
              class="w-full"
              :class="{ 'p-invalid': errors.firstName }"
              @input="clearError('firstName')"
            />
            <small class="field-error" v-if="errors.firstName">{{ errors.firstName }}</small>
          </div>

          <div class="form-field">
            <label class="label" for="middleInitial">Middle Initial</label>
            <InputText
              id="middleInitial"
              v-model="form.middleInitial"
              class="w-full"
              :class="{ 'p-invalid': errors.middleInitial }"
              @input="clearError('middleInitial')"
            />
            <small class="field-error" v-if="errors.middleInitial">{{ errors.middleInitial }}</small>
          </div>

          <div class="form-field">
            <label class="label" for="lastName">Last Name <span class="required">*</span></label>
            <InputText
              id="lastName"
              v-model="form.lastName"
              class="w-full"
              :class="{ 'p-invalid': errors.lastName }"
              @input="clearError('lastName')"
            />
            <small class="field-error" v-if="errors.lastName">{{ errors.lastName }}</small>
          </div>

          <div class="form-field">
            <label class="label" for="nickname">Nickname</label>
            <InputText id="nickname" v-model="form.nickname" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="email">Email</label>
            <InputText
              id="email"
              v-model="form.email"
              class="w-full"
              :class="{ 'p-invalid': errors.email }"
              @input="clearError('email')"
            />
            <small class="field-error" v-if="errors.email">{{ errors.email }}</small>
          </div>

          <div class="form-field">
            <label class="label" for="phone">Phone</label>
            <InputText
              id="phone"
              v-model="form.phone"
              class="w-full"
              :class="{ 'p-invalid': errors.phone }"
              @input="clearError('phone')"
            />
            <small class="field-error" v-if="errors.phone">{{ errors.phone }}</small>
          </div>

          <div class="form-field">
            <label class="label" for="cell">Cell</label>
            <InputText
              id="cell"
              v-model="form.cell"
              class="w-full"
              :class="{ 'p-invalid': errors.cell }"
              @input="clearError('cell')"
            />
            <small class="field-error" v-if="errors.cell">{{ errors.cell }}</small>
          </div>

          <div class="form-field">
            <label class="label" for="street">Street</label>
            <InputText id="street" v-model="form.street" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="unit">Unit</label>
            <InputText id="unit" v-model="form.unit" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="city">City</label>
            <InputText id="city" v-model="form.city" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="state">State</label>
            <InputText id="state" v-model="form.state" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="zip">Zip</label>
            <InputText
              id="zip"
              v-model="form.zip"
              class="w-full"
              :class="{ 'p-invalid': errors.zip }"
              @input="clearError('zip')"
            />
            <small class="field-error" v-if="errors.zip">{{ errors.zip }}</small>
          </div>

          <div class="form-field">
            <label class="label" for="birthDate">Birth Date</label>
            <InputText
              id="birthDate"
              v-model="form.birthDate"
              placeholder="YYYY-MM-DD"
              class="w-full"
              :class="{ 'p-invalid': errors.birthDate }"
              @input="clearError('birthDate')"
            />
            <small class="field-error" v-if="errors.birthDate">{{ errors.birthDate }}</small>
          </div>
        </div>

        <!-- Home Village Section -->
        <div class="section">
          <h3 class="section-header">Home Village</h3>

          <div class="form-field">
            <label class="label" for="villageId">Village</label>
            <Select
              id="villageId"
              v-model="form.villageId"
              :options="villages"
              optionLabel="name"
              optionValue="villageId"
              placeholder="(no home village)"
              showClear
              class="w-full"
            />
          </div>
        </div>

        <!-- Communities Section -->
        <div class="section">
          <h3 class="section-header">Communities</h3>

          <div class="form-field communities-row">
            <label class="checkbox-item">
              <Checkbox
                :modelValue="communityNames.has('Pride')"
                binary
                @update:modelValue="v => toggleCommunity('Pride', v)"
              />
              <span class="checkbox-label">Pride</span>
            </label>
            <label class="checkbox-item">
              <Checkbox
                :modelValue="communityNames.has('Veteran')"
                binary
                @update:modelValue="v => toggleCommunity('Veteran', v)"
              />
              <span class="checkbox-label">Veteran</span>
            </label>
          </div>
        </div>

        <!-- Emergency Contact Section -->
        <div class="section">
          <h3 class="section-header">Emergency Contact</h3>

          <div class="form-field">
            <label class="label" for="emergencyContactName">Name</label>
            <InputText id="emergencyContactName" v-model="form.emergencyContactName" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="emergencyContactRelationship">Relationship</label>
            <InputText id="emergencyContactRelationship" v-model="form.emergencyContactRelationship" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="emergencyContactPhone">Phone</label>
            <InputText
              id="emergencyContactPhone"
              v-model="form.emergencyContactPhone"
              class="w-full"
              :class="{ 'p-invalid': errors.emergencyContactPhone }"
              @input="clearError('emergencyContactPhone')"
            />
            <small class="field-error" v-if="errors.emergencyContactPhone">{{ errors.emergencyContactPhone }}</small>
          </div>

          <div class="form-field">
            <label class="label" for="emergencyContactEmail">Email</label>
            <InputText
              id="emergencyContactEmail"
              v-model="form.emergencyContactEmail"
              class="w-full"
              :class="{ 'p-invalid': errors.emergencyContactEmail }"
              @input="clearError('emergencyContactEmail')"
            />
            <small class="field-error" v-if="errors.emergencyContactEmail">{{ errors.emergencyContactEmail }}</small>
          </div>
        </div>

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

.section {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
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

.label {
  font-weight: 600;
  color: var(--color-text-dim);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.required {
  color: var(--color-text-error);
}

.field-error {
  color: var(--color-text-error);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.w-full {
  width: 100%;
}

.communities-row {
  grid-column: 1 / -1;
  flex-direction: row;
  gap: 1.5rem;
  align-items: center;
  padding-top: 0.25rem;
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
}

@media (max-width: 600px) {
  .section {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>
