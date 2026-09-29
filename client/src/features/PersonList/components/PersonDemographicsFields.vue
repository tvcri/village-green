<script setup>
import Select from 'primevue/select'
import IftaLabel from 'primevue/iftalabel'
import Checkbox from 'primevue/checkbox'
import { uncertainText as sharedUncertainText } from '../lib/uncertainText.js'

const props = defineProps({
  lookups: { type: Object, required: true },        // { genders, ethnicities, races }
  uncertain: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['edited'])
const genderId = defineModel('genderId', { type: String, default: null })
const ethnicityId = defineModel('ethnicityId', { type: String, default: null })
const isVeteran = defineModel('isVeteran', { type: Boolean, default: null })
const raceIds = defineModel('raceIds', { type: Array, default: () => [] })

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

    <div class="form-field span-2">
      <IftaLabel>
        <Select
          id="genderId" v-model="genderId"
          :options="lookups.genders" optionLabel="name" optionValue="genderId"
          placeholder="Not recorded" showClear class="w-full"
          @update:modelValue="emit('edited', 'genderId')"
        />
        <label for="genderId">Gender
          <i v-if="uncertain.genderId" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('genderId')" />
        </label>
      </IftaLabel>
    </div>

    <div class="form-field span-2">
      <IftaLabel>
        <Select
          id="ethnicityId" v-model="ethnicityId"
          :options="lookups.ethnicities" optionLabel="name" optionValue="ethnicityId"
          placeholder="Not recorded" showClear class="w-full"
          @update:modelValue="emit('edited', 'ethnicityId')"
        />
        <label for="ethnicityId">Ethnicity</label>
      </IftaLabel>
    </div>

    <div class="form-field span-2">
      <IftaLabel>
        <Select
          id="isVeteran" v-model="isVeteran"
          :options="veteranOptions" optionLabel="label" optionValue="value"
          placeholder="Unknown" showClear class="w-full"
          @update:modelValue="emit('edited', 'isVeteran')"
        />
        <label for="isVeteran">Veteran
          <i v-if="uncertain.isVeteran" class="pi pi-exclamation-triangle uncertain-icon" v-tooltip.top="uncertainText('isVeteran')" />
        </label>
      </IftaLabel>
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
  grid-template-columns: repeat(6, 1fr);
}

.races-row {
  grid-column: 1 / -1;
}

.races-options {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.5rem;
}

@media (max-width: 900px) {
  .section {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 600px) {
  .section {
    grid-template-columns: 1fr;
  }
}
</style>
