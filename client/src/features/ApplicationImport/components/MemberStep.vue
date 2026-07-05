<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Message from 'primevue/message'
import MemberFormFields from '../../PersonList/components/MemberFormFields.vue'
import { mapMemberForm, uncertainMapForMember, composeNotes } from '../lib/importMapping.js'
import { getPerson } from '../../PersonList/api/personApi.js'
import { putMember, patchMember } from '../../PersonList/api/roleApi.js'

const props = defineProps({
  extraction: { type: Object, required: true },
  memberIndex: { type: Number, required: true },
  personId: { type: [Number, String], required: true },
  primaryPersonId: { type: [Number, String], default: null },
  primaryPersonName: { type: String, default: '' },
})
const emit = defineEmits(['member-done'])
const toast = useToast()

// Full member-form shape (matches MemberEdit) with import prefills merged in
const form = reactive({
  memberNumber: '', memberLevel: '', memberType: '', primaryPersonId: '',
  secondaryType: '', serviceNotes: '', joinDate: '',
  status: '', dropReason: '', householdSize: null, householdDues: null,
  quickbooksKey: '', printedNewsletter: false,
  confidentialNotes: '', statusChangeNotes: '', miscNotes: '',
  ...mapMemberForm(props.extraction, props.memberIndex, props.primaryPersonId),
})
const uncertain = reactive(uncertainMapForMember(props.extraction, props.memberIndex))
const hasMember = ref(false)
const saving = ref(false)

onMounted(async () => {
  try {
    // A chosen existing person may already hold a member role: load it and
    // switch to patch semantics, keeping only the notes dump from the import.
    const p = await getPerson(props.personId, ['memberDetail'])
    if (p.memberDetail) {
      hasMember.value = true
      const d = p.memberDetail
      Object.keys(form).forEach(k => {
        if (k === 'primaryPersonId') form.primaryPersonId = d.primaryPerson?.personId ?? ''
        else if (d[k] != null) form[k] = d[k]
      })
      const dump = composeNotes(props.extraction, props.memberIndex)
      form.miscNotes = form.miscNotes ? `${form.miscNotes}\n\n${dump}` : dump
    }
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load member data — go back and retry', life: 3000 })
  }
})

function onEdited (field) {
  delete uncertain[field]
}

function payload () {
  const out = {}
  Object.entries(form).forEach(([k, v]) => {
    if (v === '' || v === null) return
    out[k] = v
  })
  return out
}

async function submit () {
  saving.value = true
  try {
    if (hasMember.value) await patchMember(props.personId, payload())
    else await putMember(props.personId, payload())
    emit('member-done')
  }
  catch (err) {
    toast.add({
      severity: 'error', summary: 'Error',
      detail: err?.body?.error ?? 'Failed to save member role', life: 4000,
    })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <Message v-if="hasMember" severity="info" :closable="false">
      This person already has a member role — saving will update it.
    </Message>
    <form @submit.prevent="submit">
      <MemberFormFields
        :form="form" :uncertain="uncertain"
        :primary-person-name="primaryPersonName"
        @edited="onEdited"
      />
      <div class="step-footer">
        <Button type="submit" :label="hasMember ? 'Update Member & Continue' : 'Grant Member Role & Continue'" :loading="saving" />
      </div>
    </form>
  </div>
</template>

<style scoped>
.step-footer { display: flex; justify-content: flex-end; margin-top: 1.5rem; }
</style>
