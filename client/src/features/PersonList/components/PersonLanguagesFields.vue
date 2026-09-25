<script setup>
import Checkbox from 'primevue/checkbox'
import RadioButton from 'primevue/radiobutton'

defineProps({
  languages: { type: Array, default: () => [] },   // [{ languageId, name, tag }] — the catalog
})
const emit = defineEmits(['edited'])
const languageIds = defineModel('languageIds', { default: () => [] })
const preferredLanguageId = defineModel('preferredLanguageId', { default: null })

function toggle (id, checked) {
  languageIds.value = checked
    ? [...languageIds.value, id]
    : languageIds.value.filter(x => x !== id)
  // A language the person no longer speaks cannot stay preferred.
  if (!checked && preferredLanguageId.value === id) preferredLanguageId.value = null
  emit('edited', 'languageIds')
}

function prefer (id) {
  preferredLanguageId.value = id
  emit('edited', 'preferredLanguageId')
}
</script>

<template>
  <div class="section">
    <h3 class="section-header">Languages</h3>
    <!-- One radio group: at most one preferred language, structurally. -->
    <div class="form-field languages-list">
      <div v-for="l in languages" :key="l.languageId" class="language-row">
        <label class="checkbox-item">
          <Checkbox
            :modelValue="languageIds.includes(l.languageId)"
            binary
            @update:modelValue="v => toggle(l.languageId, v)"
          />
          <span class="checkbox-label">{{ l.name }}</span>
        </label>
        <label v-if="languageIds.includes(l.languageId)" class="checkbox-item">
          <RadioButton
            :modelValue="preferredLanguageId"
            :value="l.languageId"
            name="preferredLanguage"
            @update:modelValue="prefer"
          />
          <span class="checkbox-label">Preferred</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped src="./formFields.css"></style>
<style scoped>
.section {
  grid-template-columns: 1fr;
}

.languages-list {
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.25rem;
}

.language-row {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
</style>
