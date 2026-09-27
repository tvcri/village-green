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
  <!-- A subgroup of Personal Information: the parent's grid places it and
       supplies the "Languages" subheader. One radio group: at most one
       preferred language, structurally. No .form-field class: the parent's
       scoped copy of that rule loads after this one and its display: flex
       would override the grid below. -->
  <div class="languages-list">
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
</template>

<style scoped src="./formFields.css"></style>
<style scoped>
/* Names in one column, Preferred radios in the next, so the radios line up
   whatever the name lengths. Rows are display: contents so their two labels
   become grid items; the explicit columns keep an unchecked row (no radio)
   from pulling the next name up into column 2. */
.languages-list {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: max-content max-content;
  gap: 0.75rem 2rem;
  align-items: center;
  padding-top: 0.25rem;
}

.language-row {
  display: contents;
}

.language-row > :first-child {
  grid-column: 1;
}

.language-row > :nth-child(2) {
  grid-column: 2;
}
</style>
