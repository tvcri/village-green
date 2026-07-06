<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import UploadStep from './UploadStep.vue'
import PersonStep from './PersonStep.vue'
import MemberStep from './MemberStep.vue'
import VolunteerStep from './VolunteerStep.vue'
import DoneStep from './DoneStep.vue'

const router = useRouter()

const extraction = ref(null)
const stepIndex = ref(0)
const created = ref([])            // [{ personId, fullName, existing, memberGranted }]
const cancelVisible = ref(false)

const isDual = computed(() =>
  extraction.value?.application.householdType === 'Dual' && extraction.value.members.length > 1)

const steps = computed(() => {
  if (!extraction.value) return [{ key: 'upload', label: 'Upload' }]
  if (extraction.value.applicationType === 'volunteer') {
    return [
      { key: 'upload', label: 'Upload' },
      { key: 'volunteer', label: 'Volunteer' },
      { key: 'done', label: 'Done' },
    ]
  }
  const s = [
    { key: 'upload', label: 'Upload' },
    { key: 'person-0', label: 'Person 1', memberIndex: 0 },
    { key: 'member-0', label: 'Member 1', memberIndex: 0 },
  ]
  if (isDual.value) {
    s.push(
      { key: 'person-1', label: 'Person 2', memberIndex: 1 },
      { key: 'member-1', label: 'Member 2', memberIndex: 1 },
    )
  }
  s.push({ key: 'done', label: 'Done' })
  return s
})

const currentStep = computed(() => steps.value[stepIndex.value])

function onExtracted (result) {
  extraction.value = result
  stepIndex.value = 1
}

function onPersonDone ({ personId, fullName, existing }) {
  created.value.push({ personId, fullName, existing, memberGranted: false })
  stepIndex.value++
}

function onMemberDone () {
  created.value[created.value.length - 1].memberGranted = true
  stepIndex.value++
}

function onVolunteerDone ({ personId, fullName }) {
  created.value.push({ personId, fullName, existing: false, memberGranted: true })
  stepIndex.value++
}

function requestCancel () {
  if (created.value.length === 0) return exit()
  cancelVisible.value = true
}

function exit () {
  router.push({ name: 'meta-persons' })
}

function restart () {
  extraction.value = null
  created.value = []
  stepIndex.value = 0
}
</script>

<template>
  <Card class="detail-card">
    <template #title>Import Member Application</template>
    <template #content>
      <div class="step-indicator">
        <span v-for="(s, i) in steps" :key="s.key"
          class="step" :class="{ active: i === stepIndex, done: i < stepIndex }">
          {{ s.label }}
        </span>
      </div>

      <UploadStep v-if="currentStep.key === 'upload'" @extracted="onExtracted" />
      <PersonStep v-else-if="currentStep.key.startsWith('person-')"
        :key="currentStep.key"
        :extraction="extraction" :memberIndex="currentStep.memberIndex"
        @person-done="onPersonDone" />
      <MemberStep v-else-if="currentStep.key.startsWith('member-')"
        :key="currentStep.key"
        :extraction="extraction" :memberIndex="currentStep.memberIndex"
        :personId="created[currentStep.memberIndex].personId"
        :primaryPersonId="currentStep.memberIndex > 0 ? created[0].personId : null"
        :primaryPersonName="currentStep.memberIndex > 0 ? created[0].fullName : ''"
        @member-done="onMemberDone" />
      <VolunteerStep v-else-if="currentStep.key === 'volunteer'"
        :extraction="extraction"
        @volunteer-done="onVolunteerDone" />
      <DoneStep v-else-if="currentStep.key === 'done'" :created="created" @restart="restart" />

      <div class="wizard-footer">
        <span v-if="extraction?.usage" class="usage">
          {{ extraction.usage.inputTokens }} in / {{ extraction.usage.outputTokens }} out tokens —
          ${{ extraction.usage.cost.toFixed(4) }}
        </span>
        <Button v-if="currentStep.key !== 'done'" label="Cancel" severity="secondary" @click="requestCancel" />
      </div>

      <Dialog v-model:visible="cancelVisible" header="Cancel import?" modal>
        <p>The following were already created and will remain:</p>
        <ul>
          <li v-for="c in created" :key="c.personId">
            {{ c.fullName }} — {{ c.memberGranted ? 'person and member role' : 'person only (no member role yet)' }}
          </li>
        </ul>
        <template #footer>
          <Button label="Keep Importing" severity="secondary" @click="cancelVisible = false" />
          <Button label="Cancel Import" severity="danger" @click="exit" />
        </template>
      </Dialog>
    </template>
  </Card>
</template>

<style scoped>
.detail-card { max-width: 1100px; border: 1px solid var(--color-border-default); box-shadow: var(--box-shadow-card); }
:deep(.p-card-title) { font-weight: 700; font-size: 2rem; }
.step-indicator { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
.step {
  padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.85rem;
  background: var(--p-surface-100, #f1f5f9); color: var(--color-text-dim);
}
.step.active { background: var(--p-primary-100, #dbeafe); color: var(--p-primary-700, #1d4ed8); font-weight: 600; }
.step.done { text-decoration: line-through; opacity: 0.7; }
.wizard-footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--color-border-default);
}
.usage { color: var(--color-text-dim); font-size: 0.85rem; }
</style>
