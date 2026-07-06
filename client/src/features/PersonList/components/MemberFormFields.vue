<script setup>
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'

const props = defineProps({
  form: { type: Object, required: true },
  uncertain: { type: Object, default: () => ({}) },
  primaryPersonName: { type: String, default: '' },
  createdDate: { type: String, default: '' },
  showCreatedDate: { type: Boolean, default: false },
})
const emit = defineEmits(['edited'])

const statusOptions = ['Active', 'Dropped'].map(s => ({ label: s, value: s }))

function edited (field) { emit('edited', field) }

function uncertainText (field) {
  const u = props.uncertain[field]
  return u.alternative ? `${u.reason} — alternative: ${u.alternative}` : u.reason
}
</script>

<template>
  <div class="section">
    <h3 class="section-header">Membership</h3>

    <div v-if="showCreatedDate" class="form-field">
      <label class="label" for="memberNumber">Member #
        <i v-if="uncertain.memberNumber" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('memberNumber')" />
      </label>
      <InputText id="memberNumber" v-model="form.memberNumber" class="w-full" @input="edited('memberNumber')" />
    </div>

    <div class="form-field">
      <label class="label" for="memberLevel">Member Level
        <i v-if="uncertain.memberLevel" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('memberLevel')" />
      </label>
      <InputText id="memberLevel" v-model="form.memberLevel" class="w-full" @input="edited('memberLevel')" />
    </div>

    <div class="form-field">
      <label class="label" for="memberType">Member Type
        <i v-if="uncertain.memberType" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('memberType')" />
      </label>
      <InputText id="memberType" v-model="form.memberType" class="w-full" @input="edited('memberType')" />
    </div>

    <div class="form-field">
      <label class="label" for="secondaryType">Secondary Type
        <i v-if="uncertain.secondaryType" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('secondaryType')" />
      </label>
      <InputText id="secondaryType" v-model="form.secondaryType" class="w-full" @input="edited('secondaryType')" />
    </div>

    <div class="form-field">
      <label class="label" for="primaryPersonId">Primary Person</label>
      <InputText id="primaryPersonId" :model-value="primaryPersonName" class="w-full" disabled />
    </div>

    <div class="form-field">
      <label class="label" for="joinDate">Join Date
        <i v-if="uncertain.joinDate" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('joinDate')" />
      </label>
      <InputText id="joinDate" v-model="form.joinDate" placeholder="YYYY-MM-DD" class="w-full" @input="edited('joinDate')" />
    </div>

    <div v-if="showCreatedDate" class="form-field">
      <label class="label" for="createdDate">Created Date</label>
      <InputText id="createdDate" :model-value="createdDate" class="w-full" disabled />
    </div>

    <div class="form-field">
      <label class="label" for="status">Status
        <i v-if="uncertain.status" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('status')" />
      </label>
      <Select id="status" v-model="form.status" :options="statusOptions"
              optionLabel="label" optionValue="value" placeholder="Select status" class="w-full" @update:modelValue="edited('status')" />
    </div>

    <div class="form-field">
      <label class="label" for="dropReason">Drop Reason
        <i v-if="uncertain.dropReason" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('dropReason')" />
      </label>
      <InputText id="dropReason" v-model="form.dropReason" class="w-full" @input="edited('dropReason')" />
    </div>
  </div>

  <div class="section">
    <h3 class="section-header">Household &amp; Billing</h3>

    <div class="form-field">
      <label class="label" for="householdSize">Household Size
        <i v-if="uncertain.householdSize" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('householdSize')" />
      </label>
      <InputNumber id="householdSize" v-model="form.householdSize" :min="0" show-buttons class="w-full" @update:modelValue="edited('householdSize')" />
    </div>

    <div class="form-field">
      <label class="label" for="householdDues">Household Dues
        <i v-if="uncertain.householdDues" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('householdDues')" />
      </label>
      <InputNumber id="householdDues" v-model="form.householdDues" mode="currency" currency="USD" class="w-full" @update:modelValue="edited('householdDues')" />
    </div>

    <div class="form-field">
      <label class="label" for="quickbooksKey">Quickbooks Key
        <i v-if="uncertain.quickbooksKey" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('quickbooksKey')" />
      </label>
      <InputText id="quickbooksKey" v-model="form.quickbooksKey" class="w-full" @input="edited('quickbooksKey')" />
    </div>

    <div class="form-field checkbox-field">
      <label class="checkbox-item">
        <Checkbox v-model="form.printedNewsletter" binary @update:modelValue="edited('printedNewsletter')" />
        <span class="checkbox-label">Printed Newsletter</span>
        <i v-if="uncertain.printedNewsletter" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('printedNewsletter')" />
      </label>
    </div>
  </div>

  <div class="section notes-section">
    <h3 class="section-header">Notes</h3>

    <div class="form-field">
      <label class="label" for="serviceNotes">Service Notes
        <i v-if="uncertain.serviceNotes" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('serviceNotes')" />
      </label>
      <Textarea id="serviceNotes" v-model="form.serviceNotes" rows="3" class="w-full" @input="edited('serviceNotes')" />
    </div>

    <div class="form-field">
      <label class="label" for="confidentialNotes">Confidential Notes
        <i v-if="uncertain.confidentialNotes" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('confidentialNotes')" />
      </label>
      <Textarea id="confidentialNotes" v-model="form.confidentialNotes" rows="3" class="w-full" @input="edited('confidentialNotes')" />
    </div>

    <div class="form-field">
      <label class="label" for="statusChangeNotes">Status Change Notes
        <i v-if="uncertain.statusChangeNotes" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('statusChangeNotes')" />
      </label>
      <Textarea id="statusChangeNotes" v-model="form.statusChangeNotes" rows="3" class="w-full" @input="edited('statusChangeNotes')" />
    </div>

    <div class="form-field">
      <label class="label" for="miscNotes">Misc Notes
        <i v-if="uncertain.miscNotes" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('miscNotes')" />
      </label>
      <Textarea id="miscNotes" v-model="form.miscNotes" rows="3" class="w-full" @input="edited('miscNotes')" />
    </div>
  </div>
</template>

<style scoped>
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

.uncertain-icon {
  color: var(--p-amber-500, #f59e0b);
  margin-left: 0.35rem;
  cursor: help;
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
