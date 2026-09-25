<script setup>
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import { uncertainText as sharedUncertainText } from '../lib/uncertainText.js'

const props = defineProps({
  lookups: { type: Object, required: true },        // { genders, ethnicities, races }
  uncertain: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['edited'])
const genderId = defineModel('genderId', { default: null })
const ethnicityId = defineModel('ethnicityId', { default: null })
const isVeteran = defineModel('isVeteran', { default: null })
const raceIds = defineModel('raceIds', { default: () => [] })

// Veteran is three-valued. A Select (cleared = unknown) rather than a checkbox,
// which would turn an unknown answer into No on the next save.
const veteranOptions = [{ label: 'Yes', value: true }, { label: 'No', value: false }]

function uncertainText (field) { return sharedUncertainText(props.uncertain, field) }

function toggleRace (id, checked) {
  raceIds.value = checked ? [...raceIds.value, id] : raceIds.value.filter(x => x !== id)
  emit('edited', 'raceIds')
}
</script>

<template>
  <div class="section">
    <h3 class="section-header">Demographics</h3>

    <div class="form-field">
      <label class="label" for="genderId">Gender
        <i v-if="uncertain.genderId" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('genderId')" />
      </label>
      <Select
        id="genderId" v-model="genderId"
        :options="lookups.genders" optionLabel="name" optionValue="genderId"
        placeholder="Not recorded" showClear class="w-full"
        @update:modelValue="emit('edited', 'genderId')"
      />
    </div>

    <div class="form-field">
      <label class="label" for="ethnicityId">Ethnicity</label>
      <Select
        id="ethnicityId" v-model="ethnicityId"
        :options="lookups.ethnicities" optionLabel="name" optionValue="ethnicityId"
        placeholder="Not recorded" showClear class="w-full"
        @update:modelValue="emit('edited', 'ethnicityId')"
      />
    </div>

    <div class="form-field">
      <label class="label" for="isVeteran">Veteran
        <i v-if="uncertain.isVeteran" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('isVeteran')" />
      </label>
      <Select
        id="isVeteran" v-model="isVeteran"
        :options="veteranOptions" optionLabel="label" optionValue="value"
        placeholder="Unknown" showClear class="w-full"
        @update:modelValue="emit('edited', 'isVeteran')"
      />
    </div>

    <div class="form-field races-row">
      <span class="label">Race</span>
      <div class="races-options">
        <label v-for="r in lookups.races" :key="r.raceId" class="checkbox-item">
          <Checkbox
            :modelValue="raceIds.includes(r.raceId)"
            binary
            @update:modelValue="v => toggleRace(r.raceId, v)"
          />
          <span class="checkbox-label">{{ r.name }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped src="./formFields.css"></style>
<style scoped>
.section {
  grid-template-columns: repeat(3, 1fr);
}

.races-row {
  grid-column: 1 / -1;
}

.races-options {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.5rem;
}

@media (max-width: 600px) {
  .section {
    grid-template-columns: 1fr;
  }
}
</style>
