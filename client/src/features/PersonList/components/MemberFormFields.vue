<script setup>
import { ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import IftaLabel from 'primevue/iftalabel'
import AutoComplete from 'primevue/autocomplete'
import { getVillageMembers } from '../../MemberList/api/memberApi.js'
import { uncertainText as sharedUncertainText } from '../lib/uncertainText.js'

const props = defineProps({
  errors: { type: Object, default: () => ({}) },
  uncertain: { type: Object, default: () => ({}) },
  primaryPersonName: { type: String, default: '' },
  primaryPersonEditable: { type: Boolean, default: false },
  villageId: { type: [Number, String], default: null },
  createdDate: { type: String, default: '' },
  showCreatedDate: { type: Boolean, default: false },
  circles: { type: Array, default: () => [] },   // [{ circleId, name }] — the catalog
})
const emit = defineEmits(['edited'])

const status = defineModel('status')
const memberNumber = defineModel('memberNumber')
const memberLevel = defineModel('memberLevel')
const primaryPersonId = defineModel('primaryPersonId')
const joinDate = defineModel('joinDate')
const dropReason = defineModel('dropReason')
const householdSize = defineModel('householdSize')
const householdDues = defineModel('householdDues')
const quickbooksKey = defineModel('quickbooksKey')
const printedNewsletter = defineModel('printedNewsletter')
const serviceNotes = defineModel('serviceNotes')
const scNotes = defineModel('scNotes')
const statusChangeNotes = defineModel('statusChangeNotes')
const miscNotes = defineModel('miscNotes')
// Service preference, not membership: "when this member requests a service,
// prefer a volunteer from these circles" (member_circle_preference).
const circlePreferences = defineModel('circlePreferences', { default: () => [] })

function togglePreference (id, checked) {
  circlePreferences.value = checked
    ? [...circlePreferences.value, id]
    : circlePreferences.value.filter(x => x !== id)
  emit('edited', 'circlePreferences')
}

const statusOptions = ['Active', 'Pending', 'Dropped'].map(s => ({ label: s, value: s }))
const memberLevelOptions = ['Primary', 'Secondary'].map(s => ({ label: s, value: s }))

// Clear a field's validation error as soon as the user changes it, so the
// message disappears on correction rather than lingering until the next save.
function edited (field) {
  delete props.errors[field]
  emit('edited', field)
}

function uncertainText (field) { return sharedUncertainText(props.uncertain, field) }

// Primary Person autocomplete (edit mode only) — restricted to Primary-level
// members of the person's village, since a Secondary member's primary must
// itself be a Primary member.
const villageMembers = ref([])
const primaryPersonSuggestions = ref([])
const selectedPrimaryPerson = ref(props.primaryPersonName ? { fullName: props.primaryPersonName } : null)

async function loadVillageMembers () {
  if (!props.villageId) return
  const members = await getVillageMembers(props.villageId)
  villageMembers.value = members.filter(m => m.memberLevel === 'Primary' && String(m.personId) !== String(primaryPersonId.value))
}

function searchPrimaryPerson (event) {
  const q = event.query.trim().toLowerCase()
  primaryPersonSuggestions.value = q
    ? villageMembers.value.filter(m => m.fullName.toLowerCase().includes(q))
    : [...villageMembers.value]
}

function onPrimaryPersonSelect (event) {
  primaryPersonId.value = event.value.personId
  edited('primaryPersonId')
}

watch(memberLevel, (level) => {
  if (level === 'Secondary' && props.primaryPersonEditable && !villageMembers.value.length) loadVillageMembers()
})
</script>

<template>
  <div class="section">
    <h3 class="section-header">Membership</h3>

    <div class="form-field status-row">
      <IftaLabel>
        <Select id="status" v-model="status" :options="statusOptions"
                optionLabel="label" optionValue="value" placeholder="Select status" class="w-full" @update:modelValue="edited('status')" />
        <label for="status">Status
          <i v-if="uncertain.status" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('status')" />
        </label>
      </IftaLabel>
    </div>

    <div v-if="showCreatedDate" class="form-field">
      <IftaLabel>
        <InputText id="memberNumber" v-model="memberNumber" class="w-full" @input="edited('memberNumber')" />
        <label for="memberNumber">Member #
          <i v-if="uncertain.memberNumber" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('memberNumber')" />
        </label>
      </IftaLabel>
    </div>

    <div class="form-field">
      <IftaLabel>
        <Select id="memberLevel" v-model="memberLevel" :options="memberLevelOptions"
                optionLabel="label" optionValue="value" placeholder="Select level" class="w-full"
                :class="{ 'p-invalid': errors.memberLevel }" @update:modelValue="edited('memberLevel')" />
        <label for="memberLevel">Member Level
          <i v-if="uncertain.memberLevel" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('memberLevel')" />
        </label>
      </IftaLabel>
      <small class="field-error" v-if="errors.memberLevel">{{ errors.memberLevel }}</small>
    </div>

    <div v-if="memberLevel === 'Secondary'" class="form-field">
      <IftaLabel>
        <AutoComplete
          v-if="primaryPersonEditable"
          id="primaryPersonId"
          v-model="selectedPrimaryPerson"
          option-label="fullName"
          :suggestions="primaryPersonSuggestions"
          force-selection
          class="w-full"
          input-class="w-full"
          @complete="searchPrimaryPerson"
          @item-select="onPrimaryPersonSelect"
        />
        <InputText v-else id="primaryPersonId" :model-value="primaryPersonName" class="w-full" disabled />
        <label for="primaryPersonId">Primary Person</label>
      </IftaLabel>
      <small class="field-error" v-if="errors.primaryPersonId">{{ errors.primaryPersonId }}</small>
    </div>

    <div class="form-field">
      <IftaLabel>
        <InputText id="joinDate" v-model="joinDate" placeholder="YYYY-MM-DD" class="w-full"
                   :class="{ 'p-invalid': errors.joinDate }" @input="edited('joinDate')" />
        <label for="joinDate">Join Date
          <i v-if="uncertain.joinDate" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('joinDate')" />
        </label>
      </IftaLabel>
      <small class="field-error" v-if="errors.joinDate">{{ errors.joinDate }}</small>
    </div>

    <div v-if="status === 'Dropped'" class="form-field">
      <IftaLabel>
        <InputText id="dropReason" v-model="dropReason" class="w-full" @input="edited('dropReason')" />
        <label for="dropReason">Drop Reason
          <i v-if="uncertain.dropReason" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('dropReason')" />
        </label>
      </IftaLabel>
    </div>
  </div>

  <div class="section">
    <h3 class="section-header">Household &amp; Billing</h3>

    <div class="form-field">
      <IftaLabel>
        <InputNumber id="householdSize" v-model="householdSize" :min="0" show-buttons class="w-full" @update:modelValue="edited('householdSize')" />
        <label for="householdSize">Household Size
          <i v-if="uncertain.householdSize" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('householdSize')" />
        </label>
      </IftaLabel>
    </div>

    <div class="form-field">
      <IftaLabel>
        <InputNumber id="householdDues" v-model="householdDues" mode="currency" currency="USD" class="w-full" @update:modelValue="edited('householdDues')" />
        <label for="householdDues">Household Dues
          <i v-if="uncertain.householdDues" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('householdDues')" />
        </label>
      </IftaLabel>
    </div>

    <div class="form-field">
      <IftaLabel>
        <InputText id="quickbooksKey" v-model="quickbooksKey" class="w-full" @input="edited('quickbooksKey')" />
        <label for="quickbooksKey">Quickbooks Key
          <i v-if="uncertain.quickbooksKey" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('quickbooksKey')" />
        </label>
      </IftaLabel>
    </div>

    <div class="form-field checkbox-field">
      <label class="checkbox-item">
        <Checkbox v-model="printedNewsletter" binary @update:modelValue="edited('printedNewsletter')" />
        <span class="checkbox-label">Printed Newsletter</span>
        <i v-if="uncertain.printedNewsletter" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('printedNewsletter')" />
      </label>
    </div>

  </div>

  <div v-if="circles.length" class="section">
    <h3 class="section-header">Service preferences — prefer a volunteer from these circles</h3>
    <div class="form-field preferences-row">
      <label v-for="c in circles" :key="c.circleId" class="checkbox-item">
        <Checkbox
          :modelValue="circlePreferences.includes(c.circleId)"
          binary
          @update:modelValue="v => togglePreference(c.circleId, v)"
        />
        <span class="checkbox-label">{{ c.name }}</span>
      </label>
    </div>
  </div>

  <div class="section notes-section">
    <h3 class="section-header">Notes</h3>

    <div class="form-field">
      <IftaLabel>
        <Textarea id="serviceNotes" v-model="serviceNotes" rows="3" class="w-full" @input="edited('serviceNotes')" />
        <label for="serviceNotes">Service Notes
          <i v-if="uncertain.serviceNotes" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('serviceNotes')" />
        </label>
      </IftaLabel>
    </div>

    <div class="form-field">
      <IftaLabel>
        <Textarea id="scNotes" v-model="scNotes" rows="3" class="w-full" @input="edited('scNotes')" />
        <label for="scNotes">Service Coordinator Notes
          <i v-if="uncertain.scNotes" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('scNotes')" />
        </label>
      </IftaLabel>
    </div>

    <div class="form-field">
      <IftaLabel>
        <Textarea id="statusChangeNotes" v-model="statusChangeNotes" rows="3" class="w-full" @input="edited('statusChangeNotes')" />
        <label for="statusChangeNotes">Status Change Notes
          <i v-if="uncertain.statusChangeNotes" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('statusChangeNotes')" />
        </label>
      </IftaLabel>
    </div>

    <div class="form-field">
      <IftaLabel>
        <Textarea id="miscNotes" v-model="miscNotes" rows="3" class="w-full" @input="edited('miscNotes')" />
        <label for="miscNotes">Misc Notes
          <i v-if="uncertain.miscNotes" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('miscNotes')" />
        </label>
      </IftaLabel>
    </div>
    
    <div v-if="showCreatedDate" class="form-field">
      <IftaLabel>
        <InputText id="createdDate" :model-value="createdDate" class="w-full" disabled />
        <label for="createdDate">Created Date</label>
      </IftaLabel>
    </div>

  </div>
</template>

<style scoped src="./formFields.css"></style>
<style scoped>
.preferences-row {
  grid-column: 1 / -1;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: center;
  padding-top: 0.25rem;
}

.section {
  grid-template-columns: repeat(4, 1fr);
}

.notes-section {
  grid-template-columns: repeat(4, 1fr);
}

.notes-section .form-field {
  grid-column: span 2;
}

.status-row {
  grid-column: 1 / -1;
  width: calc(25% - 1.125rem);
}

.checkbox-field {
  justify-content: flex-end;
}

@media (max-width: 900px) {
  .section,
  .notes-section {
    grid-template-columns: 1fr 1fr;
  }
  .notes-section .form-field {
    grid-column: span 2;
  }
  .status-row {
    width: calc(50% - 0.75rem);
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
  .status-row {
    width: 100%;
  }
}
</style>
