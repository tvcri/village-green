<script setup>
import { computed } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import AutoComplete from 'primevue/autocomplete'
import DatePicker from 'primevue/datepicker'
import { dateToServiceDate, serviceDateToDate } from '../../ServiceRequestList/lib/timeFields.js'

const props = defineProps({
  descriptor: { type: Object, required: true },
  modelValue: { type: null, default: null },
})
const emit = defineEmits(['update:modelValue'])

const BOOLEAN_OPTIONS = [
  { label: '(omit)', value: null },
  { label: 'true', value: true },
  { label: 'false', value: false },
]

function set(value) {
  emit('update:modelValue', value)
}

// Advisory only — a deliberately malformed ID to see the 400 is a legitimate
// use of this tool, so a pattern miss warns but never blocks.
const patternInvalid = computed(() => {
  const { pattern } = props.descriptor
  const value = props.modelValue
  if (!pattern || typeof value !== 'string' || value === '') return false
  return !new RegExp(pattern).test(value)
})

// DatePicker's model is a Date; the wire value is a wall-clock YYYY-MM-DD
// string. Convert at the edges with the repo's blessed helpers — never
// new Date('2026-07-25'), which parses as UTC midnight and renders as the 24th.
const dateValue = computed(() => (props.modelValue ? serviceDateToDate(props.modelValue) : null))
</script>

<template>
  <div class="param-field">
    <label :for="`param-${descriptor.name}`">
      {{ descriptor.name }}
      <span v-if="descriptor.required" class="required" aria-hidden="true">*</span>
      <span class="param-in">{{ descriptor.in }}</span>
    </label>

    <MultiSelect
      v-if="descriptor.control === 'multiselect'"
      :id="`param-${descriptor.name}`"
      :model-value="modelValue"
      :options="descriptor.options"
      display="chip"
      show-clear
      :placeholder="descriptor.placeholder || 'Select...'"
      @update:model-value="set"
    />

    <AutoComplete
      v-else-if="descriptor.control === 'chips'"
      :id="`param-${descriptor.name}`"
      :model-value="modelValue ?? []"
      multiple
      :typeahead="false"
      placeholder="Type a value, press Enter"
      @update:model-value="set"
    />

    <Select
      v-else-if="descriptor.control === 'select'"
      :id="`param-${descriptor.name}`"
      :model-value="modelValue"
      :options="descriptor.options"
      :show-clear="!descriptor.required"
      :placeholder="descriptor.placeholder || 'Select...'"
      @update:model-value="set"
    />

    <Select
      v-else-if="descriptor.control === 'tristate'"
      :id="`param-${descriptor.name}`"
      :model-value="modelValue"
      :options="BOOLEAN_OPTIONS"
      option-label="label"
      option-value="value"
      @update:model-value="set"
    />

    <InputNumber
      v-else-if="descriptor.control === 'number'"
      :id="`param-${descriptor.name}`"
      :model-value="modelValue"
      :use-grouping="false"
      :placeholder="descriptor.placeholder"
      @update:model-value="set"
    />

    <DatePicker
      v-else-if="descriptor.control === 'date'"
      :id="`param-${descriptor.name}`"
      :model-value="dateValue"
      date-format="yy-mm-dd"
      show-icon
      show-button-bar
      @update:model-value="set($event ? dateToServiceDate($event) : null)"
    />

    <InputText
      v-else
      :id="`param-${descriptor.name}`"
      :model-value="modelValue"
      :class="{ 'p-invalid': patternInvalid }"
      :placeholder="descriptor.placeholder"
      @update:model-value="set"
    />

    <small v-if="patternInvalid" class="param-hint warn">
      Does not match {{ descriptor.pattern }} (sent anyway)
    </small>
    <small v-else-if="descriptor.description" class="param-hint">{{ descriptor.description }}</small>
  </div>
</template>

<style scoped>
.param-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}
.param-field label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-primary);
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}
.required {
  color: var(--color-danger, #dc2626);
}
.param-in {
  font-weight: 400;
  font-size: 0.7rem;
  color: var(--color-text-dim);
}
.param-hint {
  color: var(--color-text-dim);
  font-size: 0.72rem;
  line-height: 1.3;
}
.param-hint.warn {
  color: var(--color-warning, #b45309);
}
</style>
