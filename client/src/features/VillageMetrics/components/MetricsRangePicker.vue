<script setup>
import { computed } from 'vue'
import SelectButton from 'primevue/selectbutton'
import DatePicker from 'primevue/datepicker'
import { PRESET_KEYS, PRESET_LABELS, presetRange, matchPreset } from '../lib/rangePresets.js'
import { dateToServiceDate, serviceDateToDate } from '../../../shared/lib/civilDate.js'

const props = defineProps({
  start: { type: String, required: true },
  end: { type: String, required: true },
  today: { type: String, required: true },
})
const emit = defineEmits(['update:range'])

// SelectButton options: [{ label, value }]
const presetOptions = PRESET_KEYS.map(key => ({ label: PRESET_LABELS[key], value: key }))

const activePreset = computed(() => matchPreset({ start: props.start, end: props.end }, props.today))

function onPreset (key) {
  if (!key || key === 'custom') return // 'custom' is display-only; picker edits drive it
  const r = presetRange(key, props.today)
  if (r) emit('update:range', r)
}

// DatePicker binds real Date objects; convert only here.
const startDate = computed({
  get: () => serviceDateToDate(props.start),
  set: (d) => emit('update:range', { start: dateToServiceDate(d), end: props.end }),
})
const endDate = computed({
  get: () => serviceDateToDate(props.end),
  set: (d) => emit('update:range', { start: props.start, end: dateToServiceDate(d) }),
})
</script>

<template>
  <div class="metrics-range-picker">
    <SelectButton
      :modelValue="activePreset"
      :options="presetOptions"
      optionLabel="label"
      optionValue="value"
      :allowEmpty="false"
      @update:modelValue="onPreset"
    />
    <div class="custom-range">
      <label>
        From
        <DatePicker v-model="startDate" dateFormat="mm/dd/yy" :maxDate="endDate" :manualInput="false" placeholder="Start" />
      </label>
      <label>
        To
        <DatePicker v-model="endDate" dateFormat="mm/dd/yy" :minDate="startDate" :manualInput="false" placeholder="End" />
      </label>
    </div>
  </div>
</template>

<style scoped>
.metrics-range-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
}
.custom-range {
  display: flex;
  gap: 1rem;
}
.custom-range label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
}
</style>
