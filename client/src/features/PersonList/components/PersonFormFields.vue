<script setup>
import { ref, onMounted } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import { uncertainText as sharedUncertainText } from '../lib/uncertainText.js'
import { geocodeTown } from '../api/personApi.js'

const props = defineProps({
  errors: { type: Object, required: true },
  uncertain: { type: Object, default: () => ({}) },
  villages: { type: Array, required: true },
  communityNames: { type: Object, required: true },  // Set
  disabilities: { type: Object, required: true },     // Map<name, note>
})
const emit = defineEmits(['edited', 'toggle-community', 'toggle-disability', 'edit-disability-note'])

const firstName = defineModel('firstName')
const middleInitial = defineModel('middleInitial')
const lastName = defineModel('lastName')
const nickname = defineModel('nickname')
const email = defineModel('email')
const phone = defineModel('phone')
const cell = defineModel('cell')
const street = defineModel('street')
const unit = defineModel('unit')
const city = defineModel('city')
const state = defineModel('state')
const zip = defineModel('zip')
const town = defineModel('town')
const birthDate = defineModel('birthDate')
const villageId = defineModel('villageId')
const emergencyContactName = defineModel('emergencyContactName')
const emergencyContactRelationship = defineModel('emergencyContactRelationship')
const emergencyContactPhone = defineModel('emergencyContactPhone')
const emergencyContactEmail = defineModel('emergencyContactEmail')

function edited (field) {
  delete props.errors[field]
  emit('edited', field)
}

function uncertainText (field) { return sharedUncertainText(props.uncertain, field) }

const townPending = ref(false)
const townFailed = ref(false)

// Blurring an untouched address must not refire the POST, so remember the
// last address that settled definitively (resolved, cleared, or too empty to
// look up). A transport error deliberately does not memoize: the next blur or
// submit retries.
let lastLookedUp = null
let inflight = null           // { key, promise } for the lookup in progress
let addressDirty = false      // user typed in an address field since the last settle

function addressKey () {
  return [street.value, city.value, state.value, zip.value].map(v => (v ?? '').trim()).join('|')
}

function editedAddress (field) {
  addressDirty = true
  edited(field)
}

// Municipality is a calculated value: it always re-derives from the address.
// There is no user-entered value to protect.
function lookupTown () {
  const key = addressKey()
  if (!street.value || !zip.value) {
    // An address without street or zip has no municipality. Clear rather than
    // skip, so blanking the address can't keep the previous municipality.
    town.value = ''
    townFailed.value = false
    lastLookedUp = key
    addressDirty = false
    return Promise.resolve()
  }
  if (key === lastLookedUp) return Promise.resolve()
  if (inflight?.key === key) return inflight.promise
  const promise = runLookup(key)
  inflight = { key, promise }
  return promise
}

async function runLookup (key) {
  townPending.value = true
  townFailed.value = false
  try {
    const { town: found } = await geocodeTown({ street: street.value, city: city.value, state: state.value, zip: zip.value })
    // Apply only if the address is still the one this lookup was made for —
    // a response for an already-edited address must never win.
    if (addressKey() !== key) return
    // A null result clears the value (empty string, not null) so the edit-path
    // payload sends an explicit null and the stale municipality isn't silently
    // kept when a changed address fails to resolve.
    town.value = found ?? ''
    townFailed.value = !found
    lastLookedUp = key
    addressDirty = false
  }
  catch {
    if (addressKey() !== key) return
    // Transport error: clear, exactly like an unresolved address. The display
    // shows the failure text, so a kept value would be submitted invisibly —
    // and the lookup only ran because the address wasn't already settled.
    town.value = ''
    townFailed.value = true
  }
  finally {
    if (inflight?.key === key) {
      inflight = null
      townPending.value = false
    }
  }
}

// For parents to await before building a payload: starts a lookup if the
// address changed without a settling blur (an Enter-key submit fires none)
// and resolves when any in-flight lookup lands, so the payload never carries
// a municipality the address has outrun.
function townSettled () {
  if (addressDirty || inflight) return lookupTown()
  return Promise.resolve()
}
defineExpose({ townSettled })

// Programmatically prefilled forms (the application import wizard) set
// street/city/state/zip directly without ever firing a blur event, so
// lookupTown() would otherwise never run for them. Fire it once on mount —
// but only when there's no town yet, so a value already carried in (e.g.
// PersonEditForm loading an existing person) is never overwritten, and only
// when the existing guard would pass anyway.
onMounted(() => {
  if (!town.value) lookupTown()
})
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
        v-model="firstName"
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
        v-model="middleInitial"
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
        v-model="lastName"
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
      <InputText id="nickname" v-model="nickname" class="w-full" @input="edited('nickname')" />
    </div>

    <div class="form-field">
      <label class="label" for="email">Email
        <i v-if="uncertain.email" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('email')" />
      </label>
      <InputText
        id="email"
        v-model="email"
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
        v-model="phone"
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
        v-model="cell"
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
      <InputText id="street" v-model="street" class="w-full" @input="editedAddress('street')" @blur="lookupTown()" />
    </div>

    <div class="form-field">
      <label class="label" for="unit">Unit
        <i v-if="uncertain.unit" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('unit')" />
      </label>
      <InputText id="unit" v-model="unit" class="w-full" @input="edited('unit')" />
    </div>

    <div class="form-field">
      <label class="label" for="city">City
        <i v-if="uncertain.city" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('city')" />
      </label>
      <InputText id="city" v-model="city" class="w-full" @input="editedAddress('city')" @blur="lookupTown()" />
    </div>

    <div class="form-field">
      <label class="label" for="state">State
        <i v-if="uncertain.state" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('state')" />
      </label>
      <InputText id="state" v-model="state" class="w-full" @input="editedAddress('state')" @blur="lookupTown()" />
    </div>

    <div class="form-field">
      <label class="label" for="zip">Zip
        <i v-if="uncertain.zip" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('zip')" />
      </label>
      <InputText
        id="zip"
        v-model="zip"
        class="w-full"
        :class="{ 'p-invalid': errors.zip }"
        @input="editedAddress('zip')"
        @blur="lookupTown()"
      />
      <small class="field-error" v-if="errors.zip">{{ errors.zip }}</small>
    </div>

    <div class="form-field">
      <!-- A div is not a labelable element, so label[for] would associate with
           nothing; a span plus aria-labelledby carries the name instead. -->
      <span class="label" id="town-label">Municipality
        <i class="pi pi-info-circle" v-tooltip.top="'The city or town that governs this address, from the US Census. Mailing addresses often use a village or postal name instead — Wood River Junction is in Hopkinton.'" />
      </span>
      <div id="town" class="calculated-value" role="status" aria-labelledby="town-label">
        <span v-if="townPending" class="pi pi-spin pi-spinner" aria-label="Looking up municipality" />
        <span v-else-if="townFailed" class="muted">Couldn't determine automatically</span>
        <span v-else-if="town">{{ town }}</span>
        <span v-else class="muted">&mdash;</span>
      </div>
    </div>

    <div class="form-field">
      <label class="label" for="birthDate">Birth Date
        <i v-if="uncertain.birthDate" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('birthDate')" />
      </label>
      <InputText
        id="birthDate"
        v-model="birthDate"
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
        v-model="villageId"
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
      <InputText id="emergencyContactName" v-model="emergencyContactName" class="w-full" @input="edited('emergencyContactName')" />
    </div>

    <div class="form-field">
      <label class="label" for="emergencyContactRelationship">Relationship
        <i v-if="uncertain.emergencyContactRelationship" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('emergencyContactRelationship')" />
      </label>
      <InputText id="emergencyContactRelationship" v-model="emergencyContactRelationship" class="w-full" @input="edited('emergencyContactRelationship')" />
    </div>

    <div class="form-field">
      <label class="label" for="emergencyContactPhone">Phone
        <i v-if="uncertain.emergencyContactPhone" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('emergencyContactPhone')" />
      </label>
      <InputText
        id="emergencyContactPhone"
        v-model="emergencyContactPhone"
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
        v-model="emergencyContactEmail"
        class="w-full"
        :class="{ 'p-invalid': errors.emergencyContactEmail }"
        @input="edited('emergencyContactEmail')"
      />
      <small class="field-error" v-if="errors.emergencyContactEmail">{{ errors.emergencyContactEmail }}</small>
    </div>
  </div>
</template>

<style scoped src="./formFields.css"></style>
<style scoped>
.section {
  grid-template-columns: repeat(5, 1fr);
}

.required {
  color: var(--color-text-error);
}

.field-error {
  color: var(--color-text-error);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.calculated-value {
  display: flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0.75rem 0.75rem;
  background-color: var(--color-bg-hover-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  color: var(--color-text-primary);
}

.calculated-value .muted {
  color: var(--color-text-dim);
}

.communities-row {
  grid-column: 1 / -1;
  flex-direction: row;
  gap: 1.5rem;
  align-items: center;
  padding-top: 0.25rem;
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
