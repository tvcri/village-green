<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import Button from 'primevue/button'
import MemberFormFields from './MemberFormFields.vue'
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
  status: 'Active', dropReason: '', householdSize: null, householdDues: null,
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
        <MemberFormFields
          :form="form"
          :primary-person-name="primaryPersonName"
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

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border-default);
}
</style>
