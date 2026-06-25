<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
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
const form = reactive({ memberNumber: '', memberLevel: '', serviceNotes: '', joinDate: '' })

onMounted(async () => {
  const p = await getPerson(personId.value, ['memberInfo'])
  person.value = p
  if (p.memberInfo) {
    hasMember.value = true
    Object.keys(form).forEach(k => { if (p.memberInfo[k] != null) form[k] = p.memberInfo[k] })
  }
})

function payload () {
  const out = {}
  Object.entries(form).forEach(([k, v]) => { if (v !== '') out[k] = v })
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
  <div style="padding:2rem;max-width:700px;">
    <h2>Member Role — {{ person?.fullName }}</h2>

    <div v-if="!hasHomeVillage" class="notice">
      Set a home village on the person before granting a member role.
      <Button label="Back" severity="secondary" @click="back" />
    </div>

    <form v-else style="display:flex;flex-direction:column;gap:1rem;" @submit.prevent="save">
      <label>Member # <InputText v-model="form.memberNumber" /></label>
      <label>Member Level <InputText v-model="form.memberLevel" /></label>
      <label>Service Notes <InputText v-model="form.serviceNotes" /></label>
      <label>Join Date <InputText v-model="form.joinDate" placeholder="YYYY-MM-DD" /></label>
      <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
        <Button v-if="hasMember" type="button" label="Revoke Role" severity="danger" @click="revoke" />
        <Button type="button" label="Cancel" severity="secondary" @click="back" />
        <Button type="submit" :label="hasMember ? 'Save' : 'Grant Member Role'" />
      </div>
    </form>
  </div>
</template>

<style scoped>
.notice { padding:1rem;border:1px solid var(--color-border-default);border-radius:6px;display:flex;flex-direction:column;gap:1rem;align-items:flex-start; }
</style>
