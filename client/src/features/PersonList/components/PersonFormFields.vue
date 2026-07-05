<script setup>
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'

const props = defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, required: true },
  uncertain: { type: Object, default: () => ({}) },
  villages: { type: Array, required: true },
  communityNames: { type: Object, required: true },  // Set
  disabilities: { type: Object, required: true },     // Map<name, note>
})
const emit = defineEmits(['edited', 'toggle-community', 'toggle-disability', 'edit-disability-note'])

function edited (field) {
  delete props.errors[field]
  emit('edited', field)
}

function uncertainText (field) {
  const u = props.uncertain[field]
  return u.alternative ? `${u.reason} — alternative: ${u.alternative}` : u.reason
}
</script>

<template>
  <!-- Personal Information Section -->
  <div class="section">
    <h3 class="section-header">Personal Information</h3>

    <div class="form-field">
      <label class="label" for="firstName">First Name <span class="required">*</span>
        <i v-if="uncertain.firstName" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('firstName')" />
      </label>
      <InputText
        id="firstName"
        v-model="form.firstName"
        class="w-full"
        :class="{ 'p-invalid': errors.firstName }"
        @input="edited('firstName')"
      />
      <small class="field-error" v-if="errors.firstName">{{ errors.firstName }}</small>
    </div>

    <div class="form-field">
      <label class="label" for="middleInitial">Middle Initial
        <i v-if="uncertain.middleInitial" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('middleInitial')" />
      </label>
      <InputText
        id="middleInitial"
        v-model="form.middleInitial"
        class="w-full"
        :class="{ 'p-invalid': errors.middleInitial }"
        @input="edited('middleInitial')"
      />
      <small class="field-error" v-if="errors.middleInitial">{{ errors.middleInitial }}</small>
    </div>

    <div class="form-field">
      <label class="label" for="lastName">Last Name <span class="required">*</span>
        <i v-if="uncertain.lastName" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('lastName')" />
      </label>
      <InputText
        id="lastName"
        v-model="form.lastName"
        class="w-full"
        :class="{ 'p-invalid': errors.lastName }"
        @input="edited('lastName')"
      />
      <small class="field-error" v-if="errors.lastName">{{ errors.lastName }}</small>
    </div>

    <div class="form-field">
      <label class="label" for="nickname">Nickname
        <i v-if="uncertain.nickname" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('nickname')" />
      </label>
      <InputText id="nickname" v-model="form.nickname" class="w-full" @input="edited('nickname')" />
    </div>

    <div class="form-field">
      <label class="label" for="email">Email
        <i v-if="uncertain.email" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('email')" />
      </label>
      <InputText
        id="email"
        v-model="form.email"
        class="w-full"
        :class="{ 'p-invalid': errors.email }"
        @input="edited('email')"
      />
      <small class="field-error" v-if="errors.email">{{ errors.email }}</small>
    </div>

    <div class="form-field">
      <label class="label" for="phone">Phone
        <i v-if="uncertain.phone" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('phone')" />
      </label>
      <InputText
        id="phone"
        v-model="form.phone"
        class="w-full"
        :class="{ 'p-invalid': errors.phone }"
        @input="edited('phone')"
      />
      <small class="field-error" v-if="errors.phone">{{ errors.phone }}</small>
    </div>

    <div class="form-field">
      <label class="label" for="cell">Cell
        <i v-if="uncertain.cell" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('cell')" />
      </label>
      <InputText
        id="cell"
        v-model="form.cell"
        class="w-full"
        :class="{ 'p-invalid': errors.cell }"
        @input="edited('cell')"
      />
      <small class="field-error" v-if="errors.cell">{{ errors.cell }}</small>
    </div>

    <div class="form-field">
      <label class="label" for="street">Street
        <i v-if="uncertain.street" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('street')" />
      </label>
      <InputText id="street" v-model="form.street" class="w-full" @input="edited('street')" />
    </div>

    <div class="form-field">
      <label class="label" for="unit">Unit
        <i v-if="uncertain.unit" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('unit')" />
      </label>
      <InputText id="unit" v-model="form.unit" class="w-full" @input="edited('unit')" />
    </div>

    <div class="form-field">
      <label class="label" for="city">City
        <i v-if="uncertain.city" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('city')" />
      </label>
      <InputText id="city" v-model="form.city" class="w-full" @input="edited('city')" />
    </div>

    <div class="form-field">
      <label class="label" for="state">State
        <i v-if="uncertain.state" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('state')" />
      </label>
      <InputText id="state" v-model="form.state" class="w-full" @input="edited('state')" />
    </div>

    <div class="form-field">
      <label class="label" for="zip">Zip
        <i v-if="uncertain.zip" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('zip')" />
      </label>
      <InputText
        id="zip"
        v-model="form.zip"
        class="w-full"
        :class="{ 'p-invalid': errors.zip }"
        @input="edited('zip')"
      />
      <small class="field-error" v-if="errors.zip">{{ errors.zip }}</small>
    </div>

    <div class="form-field">
      <label class="label" for="birthDate">Birth Date
        <i v-if="uncertain.birthDate" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('birthDate')" />
      </label>
      <InputText
        id="birthDate"
        v-model="form.birthDate"
        placeholder="YYYY-MM-DD"
        class="w-full"
        :class="{ 'p-invalid': errors.birthDate }"
        @input="edited('birthDate')"
      />
      <small class="field-error" v-if="errors.birthDate">{{ errors.birthDate }}</small>
    </div>
  </div>

  <!-- Home Village Section -->
  <div class="section">
    <h3 class="section-header">Home Village</h3>

    <div class="form-field">
      <label class="label" for="villageId">Village
        <i v-if="uncertain.villageId" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('villageId')" />
      </label>
      <Select
        id="villageId"
        v-model="form.villageId"
        :options="villages"
        optionLabel="name"
        optionValue="villageId"
        placeholder="(no home village)"
        showClear
        class="w-full"
        @update:modelValue="edited('villageId')"
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
          @update:modelValue="v => $emit('toggle-community', 'Pride', v)"
        />
        <span class="checkbox-label">Pride</span>
      </label>
      <label class="checkbox-item">
        <Checkbox
          :modelValue="communityNames.has('Veteran')"
          binary
          @update:modelValue="v => $emit('toggle-community', 'Veteran', v)"
        />
        <span class="checkbox-label">Veteran</span>
      </label>
    </div>
  </div>

  <!-- Disabilities Section -->
  <div class="section">
    <h3 class="section-header">Disabilities</h3>

    <div class="form-field disabilities-list">
      <div v-for="name in ['Vision', 'Walker', 'Hearing', 'Wheelchair', 'Cane']" :key="name" class="disability-row">
        <label class="checkbox-item">
          <Checkbox
            :modelValue="disabilities.has(name)"
            binary
            @update:modelValue="v => $emit('toggle-disability', name, v)"
          />
          <span class="checkbox-label">{{ name }}</span>
        </label>
        <InputText
          v-if="disabilities.has(name)"
          :modelValue="disabilities.get(name) ?? ''"
          placeholder="Optional note"
          class="disability-note"
          @update:modelValue="v => $emit('edit-disability-note', name, v)"
        />
      </div>
    </div>
  </div>

  <!-- Emergency Contact Section -->
  <div class="section">
    <h3 class="section-header">Emergency Contact</h3>

    <div class="form-field">
      <label class="label" for="emergencyContactName">Name
        <i v-if="uncertain.emergencyContactName" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('emergencyContactName')" />
      </label>
      <InputText id="emergencyContactName" v-model="form.emergencyContactName" class="w-full" @input="edited('emergencyContactName')" />
    </div>

    <div class="form-field">
      <label class="label" for="emergencyContactRelationship">Relationship
        <i v-if="uncertain.emergencyContactRelationship" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('emergencyContactRelationship')" />
      </label>
      <InputText id="emergencyContactRelationship" v-model="form.emergencyContactRelationship" class="w-full" @input="edited('emergencyContactRelationship')" />
    </div>

    <div class="form-field">
      <label class="label" for="emergencyContactPhone">Phone
        <i v-if="uncertain.emergencyContactPhone" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('emergencyContactPhone')" />
      </label>
      <InputText
        id="emergencyContactPhone"
        v-model="form.emergencyContactPhone"
        class="w-full"
        :class="{ 'p-invalid': errors.emergencyContactPhone }"
        @input="edited('emergencyContactPhone')"
      />
      <small class="field-error" v-if="errors.emergencyContactPhone">{{ errors.emergencyContactPhone }}</small>
    </div>

    <div class="form-field">
      <label class="label" for="emergencyContactEmail">Email
        <i v-if="uncertain.emergencyContactEmail" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('emergencyContactEmail')" />
      </label>
      <InputText
        id="emergencyContactEmail"
        v-model="form.emergencyContactEmail"
        class="w-full"
        :class="{ 'p-invalid': errors.emergencyContactEmail }"
        @input="edited('emergencyContactEmail')"
      />
      <small class="field-error" v-if="errors.emergencyContactEmail">{{ errors.emergencyContactEmail }}</small>
    </div>
  </div>
</template>

<style scoped>
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

.disabilities-list {
  grid-column: 1 / -1;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.25rem;
}

.disability-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.disability-note {
  flex: 1;
  max-width: 20rem;
}

.uncertain-icon {
  color: var(--p-amber-500, #f59e0b);
  margin-left: 0.35rem;
  cursor: help;
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
