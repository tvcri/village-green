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
  /* Children are flex items, whose min-width defaults to auto (= their content
     width). Without this they refuse to shrink below that and push the document
     wider than a phone viewport. */
  min-width: 0;
}

/* The five presets are one segmented control. At desktop width they fit on a
   row; below that the control has to wrap internally rather than clip its last
   option ("Custom" was being cut off at 390px). */
.metrics-range-picker :deep(.p-selectbutton) {
  display: flex;
  flex-wrap: wrap;
}

.custom-range {
  display: flex;
  gap: 1rem;
  flex: 1 1 auto;
  min-width: 0;
}

.custom-range label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  /* Share the row evenly and allow shrinking; the DatePicker's own intrinsic
     width would otherwise hold each label at full size and overflow. */
  flex: 1 1 0;
  min-width: 0;
}

/* The input is what actually carries the intrinsic width, so the shrink has to
   reach it too — relaxing only the label leaves the field itself overflowing. */
.custom-range :deep(.p-datepicker),
.custom-range :deep(.p-inputtext) {
  width: 100%;
  min-width: 0;
}
</style>
