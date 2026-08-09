<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import Button from 'primevue/button'
import MemberFormFields from './MemberFormFields.vue'
import { getPerson } from '../api/personApi.js'
import { putMember, patchMember, deleteMember } from '../api/roleApi.js'
import { useRequirePermission } from '../../../shared/composables/useRequirePermission.js'
import { validateMemberForm } from '../lib/memberFormValidation.js'
import { todayCivilDate } from '../../../shared/lib/civilDate.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
useRequirePermission('member:write')
const personId = computed(() => route.params.personId)

const person = ref(null)
const hasMember = ref(false)
const hasHomeVillage = computed(() => !!person.value?.village?.villageId)
const form = reactive({
  memberNumber: '', memberLevel: '', memberType: '', primaryPersonId: '',
  // A new grant joins today; an existing member's stored date overwrites this
  // in onMounted.
  serviceNotes: '', joinDate: todayCivilDate(),
  status: 'Active', dropReason: '', householdSize: null, householdDues: null,
  quickbooksKey: '', printedNewsletter: false,
  confidentialNotes: '', statusChangeNotes: '', miscNotes: '',
})
const createdDate = ref('')
const primaryPersonName = ref('')
const original = ref({ ...form })
const errors = reactive({})

onMounted(async () => {
  try {
    const p = await getPerson(personId.value, ['member'])
    person.value = p
    if (p.member) {
      hasMember.value = true
      const d = p.member
      Object.keys(form).forEach(k => {
        if (k === 'primaryPersonId') {
          form.primaryPersonId = d.primaryPerson?.personId ?? ''
        }
        // The new-grant default must not survive onto an existing member whose
        // stored joinDate is NULL — it would show as saved data and then diff
        // away in patchPayload(). Leave it blank so validation demands a date.
        else if (k === 'joinDate') form.joinDate = d.joinDate ?? ''
        else if (d[k] != null) form[k] = d[k]
      })
      primaryPersonName.value = d.primaryPerson?.fullName ?? ''
      createdDate.value = d.createdDate ?? ''
      original.value = { ...form }
    }
  }
  catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load person', life: 3000 })
  }
})

function putPayload () {
  const out = {}
  Object.entries(form).forEach(([k, v]) => {
    if (v === '' || v === null) return
    out[k] = v
  })
  return out
}

function patchPayload () {
  const isBlank = v => v === '' || v === null
  const out = {}
  Object.entries(form).forEach(([k, v]) => {
    const prev = original.value[k]
    if (v === prev || (isBlank(v) && isBlank(prev))) return
    if (isBlank(v)) {
      // MemberPatch disallows null joinDate; a cleared joinDate stays unchanged
      if (k !== 'joinDate') out[k] = null
    }
    else out[k] = v
  })
  return out
}

async function save () {
  if (!validateMemberForm(form, errors)) {
    toast.add({ severity: 'warn', summary: 'Check the form', detail: 'Fix the highlighted fields', life: 3000 })
    return
  }
  try {
    if (hasMember.value) {
      const body = patchPayload()
      if (Object.keys(body).length) await patchMember(personId.value, body)
    }
    else await putMember(personId.value, putPayload())
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Member role saved', life: 2000 })
    back()
  }
  catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save member role', life: 3000 })
  }
}

async function revoke () {
  try {
    await deleteMember(personId.value)
    toast.add({ severity: 'success', summary: 'Revoked', detail: 'Member role revoked', life: 2000 })
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
    <template #title>Member Role — {{ person?.fullName }}</template>
    <template #content>
      <div v-if="!hasHomeVillage" class="notice">
        Set a home village on the person before granting a member role.
        <Button label="Back" severity="secondary" @click="back" />
      </div>

      <form v-else @submit.prevent="save">
        <MemberFormFields
          v-model:status="form.status"
          v-model:member-number="form.memberNumber"
          v-model:member-level="form.memberLevel"
          v-model:primary-person-id="form.primaryPersonId"
          v-model:join-date="form.joinDate"
          v-model:drop-reason="form.dropReason"
          v-model:household-size="form.householdSize"
          v-model:household-dues="form.householdDues"
          v-model:quickbooks-key="form.quickbooksKey"
          v-model:printed-newsletter="form.printedNewsletter"
          v-model:service-notes="form.serviceNotes"
          v-model:confidential-notes="form.confidentialNotes"
          v-model:status-change-notes="form.statusChangeNotes"
          v-model:misc-notes="form.miscNotes"
          :errors="errors"
          :primary-person-name="primaryPersonName"
          primary-person-editable
          :village-id="person?.village?.villageId"
          :created-date="createdDate"
          :show-created-date="hasMember"
        />

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

.notice {
  padding: 1rem;
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: flex-start;
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
