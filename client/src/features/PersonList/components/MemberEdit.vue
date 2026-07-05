<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import { getPerson } from '../api/personApi.js'
import { putMember, patchMember, deleteMember } from '../api/roleApi.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const personId = computed(() => route.params.personId)

const person = ref(null)
const hasMember = ref(false)
const hasHomeVillage = computed(() => !!person.value?.village?.villageId)
const form = reactive({
  memberNumber: '', memberLevel: '', memberType: '', primaryPersonId: '',
  secondaryType: '', serviceNotes: '', joinDate: '',
  status: '', dropReason: '', householdSize: null, householdDues: null,
  quickbooksKey: '', printedNewsletter: false,
  confidentialNotes: '', statusChangeNotes: '', miscNotes: '',
})
const createdDate = ref('')
const primaryPersonName = ref('')

onMounted(async () => {
  const p = await getPerson(personId.value, ['memberDetail'])
  person.value = p
  if (p.memberDetail) {
    hasMember.value = true
    const d = p.memberDetail
    Object.keys(form).forEach(k => {
      if (k === 'primaryPersonId') {
        form.primaryPersonId = d.primaryPerson?.personId ?? ''
      }
      else if (d[k] != null) form[k] = d[k]
    })
    primaryPersonName.value = d.primaryPerson?.fullName ?? ''
    createdDate.value = d.createdDate ?? ''
  }
})

function payload () {
  const out = {}
  Object.entries(form).forEach(([k, v]) => {
    if (v === '' || v === null) return
    out[k] = v
  })
  return out
}

async function save () {
  try {
    if (hasMember.value) await patchMember(personId.value, payload())
    else await putMember(personId.value, payload())
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Member role saved', life: 2000 })
    back()
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save member role', life: 3000 })
  }
}

async function revoke () {
  try {
    await deleteMember(personId.value)
    toast.add({ severity: 'success', summary: 'Revoked', detail: 'Member role revoked', life: 2000 })
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
    <template #title>Member Role — {{ person?.fullName }}</template>
    <template #content>
      <div v-if="!hasHomeVillage" class="notice">
        Set a home village on the person before granting a member role.
        <Button label="Back" severity="secondary" @click="back" />
      </div>

      <form v-else @submit.prevent="save">
        <div class="section">
          <h3 class="section-header">Membership</h3>

          <div class="form-field">
            <label class="label" for="memberNumber">Member #</label>
            <InputText id="memberNumber" v-model="form.memberNumber" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="memberLevel">Member Level</label>
            <InputText id="memberLevel" v-model="form.memberLevel" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="memberType">Member Type</label>
            <InputText id="memberType" v-model="form.memberType" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="secondaryType">Secondary Type</label>
            <InputText id="secondaryType" v-model="form.secondaryType" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="primaryPersonId">Primary Person</label>
            <InputText id="primaryPersonId" :model-value="primaryPersonName" class="w-full" disabled />
          </div>

          <div class="form-field">
            <label class="label" for="joinDate">Join Date</label>
            <InputText id="joinDate" v-model="form.joinDate" placeholder="YYYY-MM-DD" class="w-full" />
          </div>

          <div v-if="hasMember" class="form-field">
            <label class="label" for="createdDate">Created Date</label>
            <InputText id="createdDate" :model-value="createdDate" class="w-full" disabled />
          </div>

          <div class="form-field">
            <label class="label" for="status">Status</label>
            <InputText id="status" v-model="form.status" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="dropReason">Drop Reason</label>
            <InputText id="dropReason" v-model="form.dropReason" class="w-full" />
          </div>
        </div>

        <div class="section">
          <h3 class="section-header">Household &amp; Billing</h3>

          <div class="form-field">
            <label class="label" for="householdSize">Household Size</label>
            <InputNumber id="householdSize" v-model="form.householdSize" :min="0" show-buttons class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="householdDues">Household Dues</label>
            <InputNumber id="householdDues" v-model="form.householdDues" mode="currency" currency="USD" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="quickbooksKey">Quickbooks Key</label>
            <InputText id="quickbooksKey" v-model="form.quickbooksKey" class="w-full" />
          </div>

          <div class="form-field checkbox-field">
            <label class="checkbox-item">
              <Checkbox v-model="form.printedNewsletter" binary />
              <span class="checkbox-label">Printed Newsletter</span>
            </label>
          </div>
        </div>

        <div class="section notes-section">
          <h3 class="section-header">Notes</h3>

          <div class="form-field">
            <label class="label" for="serviceNotes">Service Notes</label>
            <Textarea id="serviceNotes" v-model="form.serviceNotes" rows="3" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="confidentialNotes">Confidential Notes</label>
            <Textarea id="confidentialNotes" v-model="form.confidentialNotes" rows="3" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="statusChangeNotes">Status Change Notes</label>
            <Textarea id="statusChangeNotes" v-model="form.statusChangeNotes" rows="3" class="w-full" />
          </div>

          <div class="form-field">
            <label class="label" for="miscNotes">Misc Notes</label>
            <Textarea id="miscNotes" v-model="form.miscNotes" rows="3" class="w-full" />
          </div>
        </div>

        <div class="form-footer">
          <Button v-if="hasMember" type="button" label="Revoke Role" severity="danger" @click="revoke" />
          <Button type="button" label="Cancel" severity="secondary" @click="back" />
          <Button type="submit" :label="hasMember ? 'Save' : 'Grant Member Role'" />
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

.notes-section {
  grid-template-columns: repeat(4, 1fr);
}

.notes-section .form-field {
  grid-column: span 2;
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
  .section,
  .notes-section {
    grid-template-columns: 1fr 1fr;
  }
  .notes-section .form-field {
    grid-column: span 2;
  }
}

@media (max-width: 600px) {
  .section,
  .notes-section {
    grid-template-columns: 1fr;
  }
  .notes-section .form-field {
    grid-column: span 1;
  }
}
</style>
