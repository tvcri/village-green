<script setup>
import { ref, onMounted } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import IftaLabel from 'primevue/iftalabel'
import Checkbox from 'primevue/checkbox'
import { uncertainText as sharedUncertainText } from '../lib/uncertainText.js'
import { geocodeTown } from '../api/personApi.js'
import PersonDemographicsFields from './PersonDemographicsFields.vue'
import PersonLanguagesFields from './PersonLanguagesFields.vue'

const props = defineProps({
  errors: { type: Object, required: true },
  uncertain: { type: Object, default: () => ({}) },
  villages: { type: Array, required: true },
  circles: { type: Array, default: () => [] },       // [{ circleId, name }] — the catalog
  circleNames: { type: Object, required: true },     // Set<name> — the person's circles
  disabilities: { type: Object, required: true },    // Map<name, note>
  // Inline notice under Village when a change would remove positions (Edit Person).
  villageWarning: { type: String, default: '' },
  showBirthDate: { type: Boolean, default: true },
  // person:read_demographics governs the Demographics section, like
  // showBirthDate governs Birth Date.
  showDemographics: { type: Boolean, default: true },
  // The five 0027 catalogs (usePersonLookups().lookups).
  lookups: {
    type: Object,
    default: () => ({ genders: [], ethnicities: [], races: [], contactMethods: [], languages: [] }),
  },
  // The import wizard may *suggest* a circle tick (member application: "join
  // the Circle of Pride?" = Yes pre-ticks it); a coordinator confirms or
  // unticks before anything is saved. VolunteerStep still hides the section.
  showCircles: { type: Boolean, default: true },
})
const emit = defineEmits(['edited', 'toggle-circle', 'toggle-disability', 'edit-disability-note'])

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
const suffix = defineModel('suffix', { type: String })
const pronouns = defineModel('pronouns', { type: String })
const deceasedDate = defineModel('deceasedDate', { type: String })
const preferredContactMethodId = defineModel('preferredContactMethodId', { type: String, default: null })
const genderId = defineModel('genderId', { type: String, default: null })
const ethnicityId = defineModel('ethnicityId', { type: String, default: null })
const isVeteran = defineModel('isVeteran', { type: Boolean, default: null })
const raceIds = defineModel('raceIds', { type: Array, default: () => [] })
const languageIds = defineModel('languageIds', { type: Array, default: () => [] })
const preferredLanguageId = defineModel('preferredLanguageId', { type: String, default: null })

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
// address changed without a settling blur (a click on Save straight from an
// address field can land before its blur settles)
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
  <!-- The two ways persons are grouped lead the form, unpaneled: Village, then
       Circles (one checkbox per catalog row, so a new circle needs no code change).
       Village keeps an outside label, matching Circles beside it. -->
  <div class="section village-row">
    <div class="form-field span-2">
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
      <small v-if="villageWarning" class="village-warning" role="alert">{{ villageWarning }}</small>
    </div>

    <div v-if="showCircles" class="form-field span-4">
      <span class="label" id="circles-label">Circles</span>
      <div class="circles-options" role="group" aria-labelledby="circles-label">
        <label v-for="c in circles" :key="c.circleId" class="checkbox-item">
          <Checkbox
            :modelValue="circleNames.has(c.name)"
            binary
            @update:modelValue="v => $emit('toggle-circle', c.name, v)"
          />
          <span class="checkbox-label">{{ c.name }}</span>
        </label>
      </div>
    </div>
  </div>

  <!-- Personal Information: each subgroup is a subgrid on the section's six
       columns, so its fields line up with every other subgroup's. -->
  <div class="section">
    <h3 class="section-header">Personal Information</h3>

    <div class="subgroup">
      <h4 class="subsection-header">Name</h4>

      <div class="form-field">
        <IftaLabel>
          <InputText
            id="firstName"
            v-model="firstName"
            class="w-full"
            :class="{ 'p-invalid': errors.firstName }"
            @input="edited('firstName')"
          />
          <label for="firstName">First Name
            <i v-if="uncertain.firstName" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('firstName')" />
          </label>
        </IftaLabel>
        <small class="field-error" v-if="errors.firstName">{{ errors.firstName }}</small>
      </div>

      <div class="form-field">
        <IftaLabel>
          <InputText
            id="middleInitial"
            v-model="middleInitial"
            class="w-full"
            :class="{ 'p-invalid': errors.middleInitial }"
            @input="edited('middleInitial')"
          />
          <label for="middleInitial">Middle Initial
            <i v-if="uncertain.middleInitial" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('middleInitial')" />
          </label>
        </IftaLabel>
        <small class="field-error" v-if="errors.middleInitial">{{ errors.middleInitial }}</small>
      </div>

      <div class="form-field">
        <IftaLabel>
          <InputText
            id="lastName"
            v-model="lastName"
            class="w-full"
            :class="{ 'p-invalid': errors.lastName }"
            @input="edited('lastName')"
          />
          <label for="lastName">Last Name <span class="required">*</span>
            <i v-if="uncertain.lastName" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('lastName')" />
          </label>
        </IftaLabel>
        <small class="field-error" v-if="errors.lastName">{{ errors.lastName }}</small>
      </div>

      <div class="form-field">
        <IftaLabel>
          <InputText id="suffix" v-model="suffix" maxlength="20" placeholder="Jr., III" class="w-full" @input="edited('suffix')" />
          <label for="suffix">Suffix</label>
        </IftaLabel>
      </div>

      <div class="form-field">
        <IftaLabel>
          <InputText id="nickname" v-model="nickname" class="w-full" @input="edited('nickname')" />
          <label for="nickname">Nickname
            <i v-if="uncertain.nickname" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('nickname')" />
          </label>
        </IftaLabel>
      </div>

      <div class="form-field">
        <IftaLabel>
          <InputText id="pronouns" v-model="pronouns" maxlength="30" class="w-full" @input="edited('pronouns')" />
          <label for="pronouns">Pronouns
            <i v-if="uncertain.pronouns" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('pronouns')" />
          </label>
        </IftaLabel>
      </div>
    </div>

    <div class="subgroup">
      <h4 class="subsection-header">Contact</h4>

      <div class="form-field span-2">
        <IftaLabel>
          <InputText
            id="email"
            v-model="email"
            class="w-full"
            :class="{ 'p-invalid': errors.email }"
            @input="edited('email')"
          />
          <label for="email">Email
            <i v-if="uncertain.email" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('email')" />
          </label>
        </IftaLabel>
        <small class="field-error" v-if="errors.email">{{ errors.email }}</small>
      </div>

      <div class="form-field">
        <IftaLabel>
          <InputText
            id="phone"
            v-model="phone"
            class="w-full"
            :class="{ 'p-invalid': errors.phone }"
            @input="edited('phone')"
          />
          <label for="phone">Phone
            <i v-if="uncertain.phone" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('phone')" />
          </label>
        </IftaLabel>
        <small class="field-error" v-if="errors.phone">{{ errors.phone }}</small>
      </div>

      <div class="form-field">
        <IftaLabel>
          <InputText
            id="cell"
            v-model="cell"
            class="w-full"
            :class="{ 'p-invalid': errors.cell }"
            @input="edited('cell')"
          />
          <label for="cell">Cell
            <i v-if="uncertain.cell" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('cell')" />
          </label>
        </IftaLabel>
        <small class="field-error" v-if="errors.cell">{{ errors.cell }}</small>
      </div>

      <div class="form-field span-2">
        <IftaLabel>
          <Select
            id="preferredContactMethodId" v-model="preferredContactMethodId"
            :options="lookups.contactMethods" optionLabel="name" optionValue="contactMethodId"
            placeholder="(none)" showClear class="w-full"
            @update:modelValue="edited('preferredContactMethodId')"
          />
          <label for="preferredContactMethodId">Preferred Contact</label>
        </IftaLabel>
      </div>
    </div>

    <div class="subgroup">
      <h4 class="subsection-header">Address</h4>

      <div class="form-field span-2">
        <IftaLabel>
          <InputText id="street" v-model="street" class="w-full" @input="editedAddress('street')" @blur="lookupTown()" />
          <label for="street">Street
            <i v-if="uncertain.street" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('street')" />
          </label>
        </IftaLabel>
      </div>

      <div class="form-field">
        <IftaLabel>
          <InputText id="unit" v-model="unit" class="w-full" @input="edited('unit')" />
          <label for="unit">Unit
            <i v-if="uncertain.unit" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('unit')" />
          </label>
        </IftaLabel>
      </div>

      <div class="form-field">
        <IftaLabel>
          <InputText id="city" v-model="city" class="w-full" @input="editedAddress('city')" @blur="lookupTown()" />
          <label for="city">City
            <i v-if="uncertain.city" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('city')" />
          </label>
        </IftaLabel>
      </div>

      <div class="form-field">
        <IftaLabel>
          <InputText id="state" v-model="state" class="w-full" @input="editedAddress('state')" @blur="lookupTown()" />
          <label for="state">State
            <i v-if="uncertain.state" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('state')" />
          </label>
        </IftaLabel>
      </div>

      <div class="form-field">
        <IftaLabel>
          <InputText
            id="zip"
            v-model="zip"
            class="w-full"
            :class="{ 'p-invalid': errors.zip }"
            @input="editedAddress('zip')"
            @blur="lookupTown()"
          />
          <label for="zip">Zip
            <i v-if="uncertain.zip" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('zip')" />
          </label>
        </IftaLabel>
        <small class="field-error" v-if="errors.zip">{{ errors.zip }}</small>
      </div>
    </div>

    <!-- Values calculated from the address. Two columns today (Municipality);
         widens to four when legislative districts arrive (legislative-districts
         branch), and Dates moves over to the last two. -->
    <div class="subgroup span-2">
      <h4 class="subsection-header">Civic information</h4>

      <!-- Read-only, so no input for IftaLabel to wrap: this box copies its look,
           label inside at the top. A div is not a labelable element, so a span
           plus aria-labelledby carries the name. -->
      <div class="form-field span-2">
        <div class="calculated-value">
          <span class="calculated-label" id="town-label">Municipality
            <i class="pi pi-info-circle" v-tooltip.top="'The city or town that governs this address, from the US Census. Mailing addresses often use a village or postal name instead — Wood River Junction is in Hopkinton.'" />
          </span>
          <div id="town" role="status" aria-labelledby="town-label">
            <span v-if="townPending" class="pi pi-spin pi-spinner" aria-label="Looking up municipality" />
            <span v-else-if="townFailed" class="muted">Couldn't determine automatically</span>
            <span v-else-if="town">{{ town }}</span>
            <span v-else class="muted">&mdash;</span>
          </div>
        </div>
      </div>
    </div>

    <div class="subgroup span-2">
      <h4 class="subsection-header">Dates</h4>

      <div v-if="showBirthDate" class="form-field">
        <IftaLabel>
          <InputText
            id="birthDate"
            v-model="birthDate"
            placeholder="YYYY-MM-DD"
            class="w-full"
            :class="{ 'p-invalid': errors.birthDate }"
            @input="edited('birthDate')"
          />
          <label for="birthDate">Birth Date
            <i v-if="uncertain.birthDate" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('birthDate')" />
          </label>
        </IftaLabel>
        <small class="field-error" v-if="errors.birthDate">{{ errors.birthDate }}</small>
      </div>

      <div class="form-field">
        <IftaLabel>
          <InputText
            id="deceasedDate"
            v-model="deceasedDate"
            placeholder="YYYY-MM-DD"
            class="w-full"
            :class="{ 'p-invalid': errors.deceasedDate }"
            @input="edited('deceasedDate')"
          />
          <label for="deceasedDate">Deceased Date</label>
        </IftaLabel>
        <small class="field-error" v-if="errors.deceasedDate">{{ errors.deceasedDate }}</small>
      </div>
    </div>

    <div class="subgroup span-2 row-start">
      <h4 class="subsection-header">Languages</h4>

      <PersonLanguagesFields
        v-model:language-ids="languageIds"
        v-model:preferred-language-id="preferredLanguageId"
        :languages="lookups.languages"
        @edited="edited"
      />
    </div>

    <div class="subgroup span-4">
      <h4 class="subsection-header">Disabilities</h4>
      <!-- Names in one column, notes in the next, so the note boxes line up. -->
      <div class="disabilities-list">
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
            size="small"
            :aria-label="`${name} note`"
            class="disability-note"
            @update:modelValue="v => $emit('edit-disability-note', name, v)"
          />
        </div>
      </div>
    </div>
  </div>

  <PersonDemographicsFields
    v-if="showDemographics"
    v-model:gender-id="genderId"
    v-model:ethnicity-id="ethnicityId"
    v-model:is-veteran="isVeteran"
    v-model:race-ids="raceIds"
    :lookups="lookups"
    :uncertain="uncertain"
    @edited="edited"
  />

  <!-- Emergency Contact Section -->
  <div class="section">
    <h3 class="section-header">Emergency Contact</h3>

    <div class="form-field span-2">
      <IftaLabel>
        <InputText id="emergencyContactName" v-model="emergencyContactName" class="w-full" @input="edited('emergencyContactName')" />
        <label for="emergencyContactName">Name
          <i v-if="uncertain.emergencyContactName" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('emergencyContactName')" />
        </label>
      </IftaLabel>
    </div>

    <div class="form-field">
      <IftaLabel>
        <InputText id="emergencyContactRelationship" v-model="emergencyContactRelationship" class="w-full" @input="edited('emergencyContactRelationship')" />
        <label for="emergencyContactRelationship">Relationship
          <i v-if="uncertain.emergencyContactRelationship" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('emergencyContactRelationship')" />
        </label>
      </IftaLabel>
    </div>

    <div class="form-field">
      <IftaLabel>
        <InputText
          id="emergencyContactPhone"
          v-model="emergencyContactPhone"
          class="w-full"
          :class="{ 'p-invalid': errors.emergencyContactPhone }"
          @input="edited('emergencyContactPhone')"
        />
        <label for="emergencyContactPhone">Phone
          <i v-if="uncertain.emergencyContactPhone" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('emergencyContactPhone')" />
        </label>
      </IftaLabel>
      <small class="field-error" v-if="errors.emergencyContactPhone">{{ errors.emergencyContactPhone }}</small>
    </div>

    <div class="form-field span-2">
      <IftaLabel>
        <InputText
          id="emergencyContactEmail"
          v-model="emergencyContactEmail"
          class="w-full"
          :class="{ 'p-invalid': errors.emergencyContactEmail }"
          @input="edited('emergencyContactEmail')"
        />
        <label for="emergencyContactEmail">Email
          <i v-if="uncertain.emergencyContactEmail" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('emergencyContactEmail')" />
        </label>
      </IftaLabel>
      <small class="field-error" v-if="errors.emergencyContactEmail">{{ errors.emergencyContactEmail }}</small>
    </div>
  </div>
</template>

<style scoped src="./formFields.css"></style>
<style scoped>
.section {
  grid-template-columns: repeat(6, 1fr);
}

.village-warning { color: var(--color-text-error); display: block; margin-top: 0.3rem; }
.village-row {
  padding: 0;
  background: none;
  border: none;
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
  flex-direction: column;
  justify-content: center;
  gap: 0.2rem;
  box-sizing: border-box;
  height: 100%;
  min-height: 3.5rem;
  padding: 0.4rem 0.75rem;
  background-color: var(--color-bg-hover-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  color: var(--color-text-primary);
}

.calculated-label {
  font-size: 0.75rem;
  color: var(--color-text-dim);
}

.calculated-value .muted {
  color: var(--color-text-dim);
}

/* Languages opens its own row so it pairs with Disabilities, not with the
   Civic information and Dates pair above (2 + 2 + 2 would fill that row). */
.subgroup.row-start {
  grid-column: 1 / span 2;
}

.circles-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.5rem;
  min-height: 2.6rem;
}

/* display: contents puts each row's two parts on the list's grid; explicit
   columns keep an unticked row (no note) from pulling the next name into
   column 2. */
.disabilities-list {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: max-content minmax(0, 20rem);
  /* Every row as tall as a small note box, ticked or not: ticking a
     disability fills space that was already there instead of pushing the
     rows below it down. */
  grid-auto-rows: 2.25rem;
  gap: 0.5rem 1.25rem;
  align-items: center;
  padding-top: 0.25rem;
}

.disability-row {
  display: contents;
}

.disability-row > .checkbox-item {
  grid-column: 1;
}

.disability-note {
  grid-column: 2;
  width: 100%;
}

@media (max-width: 900px) {
  .section {
    grid-template-columns: 1fr 1fr;
  }

  .subgroup.row-start {
    grid-column: 1 / -1;
  }
}

@media (max-width: 600px) {
  .section {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>
