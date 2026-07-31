<script setup>
import { computed, onUnmounted, ref } from 'vue'
import SelectButton from 'primevue/selectbutton'
import DatePicker from 'primevue/datepicker'
import { PRESET_KEYS, PRESET_LABELS, PRESET_LABELS_SHORT, presetRange, matchPreset } from '../lib/rangePresets.js'
import { dateToServiceDate, serviceDateToDate } from '../../../shared/lib/civilDate.js'

const props = defineProps({
  start: { type: String, required: true },
  end: { type: String, required: true },
  today: { type: String, required: true },
})
const emit = defineEmits(['update:range'])

// The option LABELS are viewport-dependent, so this cannot be a CSS swap —
// SelectButton renders label text, not markup we could hide. matchMedia is the
// cheap read: one listener, no resize-storm. Guarded for jsdom, which supplies
// matchMedia only when a test stubs it.
const isNarrow = ref(
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(max-width: 640px)').matches
    : false,
)

if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(max-width: 640px)')
  const onChange = e => { isNarrow.value = e.matches }
  mq.addEventListener('change', onChange)
  onUnmounted(() => mq.removeEventListener('change', onChange))
}

// SelectButton options: [{ label, value }]
const presetOptions = computed(() => {
  const labels = isNarrow.value ? PRESET_LABELS_SHORT : PRESET_LABELS
  return PRESET_KEYS.map(key => ({ label: labels[key], value: key }))
})

// null when the range matches no preset — nothing is highlighted and the date
// fields alone carry the state.
const activePreset = computed(() => matchPreset({ start: props.start, end: props.end }, props.today))

function onPreset (key) {
  if (!key) return
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

/* The presets are one segmented control, which by default neither wraps nor
   shrinks — so a viewport too narrow for the whole row clipped the last option
   rather than reflowing. The four short-labelled presets fit one row on a
   375px phone, but this keeps a longer set (or a wider locale) from clipping. */
.metrics-range-picker :deep(.p-selectbutton) {
  display: flex;
  flex-wrap: wrap;
  /* PrimeVue draws the dividers as `border-width: 1px 1px 1px 0` — every button
     omits its left border and leans on the previous button's right border,
     with only :first-child getting one back. That holds on a single row, but a
     button that STARTS a wrapped row is not :first-child, so it renders with no
     left edge at all. There is no "first in row" selector to patch it with, so
     separate the rows instead: with a row-gap each line reads as its own group
     and the seam disappears. */
  row-gap: 0.35rem;
}

/* Only where the control actually wraps. On a single row PrimeVue's shared-edge
   look is correct and must be left alone; once the buttons sit on two rows each
   needs its own left edge and its own corners. */
@media (max-width: 640px) {
  .metrics-range-picker :deep(.p-selectbutton .p-togglebutton) {
    border-inline-start-width: 1px;
    border-radius: var(--p-selectbutton-border-radius, 6px);
  }
}

.custom-range {
  display: flex;
  gap: 1rem;
  /* `flex: 1 1 auto` is what lets these shrink on a phone, but it also makes
     them swallow every leftover pixel of a desktop row — a date is ~10
     characters and does not need 350px. The cap holds them to a sensible
     reading width; below it they still shrink normally. */
  flex: 1 1 auto;
  max-width: 26rem;
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
