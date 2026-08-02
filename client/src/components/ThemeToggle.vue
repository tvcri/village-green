<script setup>
import SelectButton from 'primevue/selectbutton'
import { useTheme } from '../shared/composables/useTheme.js'

const { mode } = useTheme()

const options = [
  { value: 'light', icon: 'pi pi-sun', label: 'Light' },
  { value: 'dark', icon: 'pi pi-moon', label: 'Dark' },
  { value: 'system', icon: 'pi pi-desktop', label: 'Browser' },
]
</script>

<template>
  <SelectButton
    v-model="mode"
    :options="options"
    option-label="value"
    option-value="value"
    data-key="value"
    :allow-empty="false"
    size="small"
    aria-label="Theme"
  >
    <template #option="slotProps">
      <i :class="slotProps.option.icon" :title="slotProps.option.label" />
    </template>
  </SelectButton>
</template>

<style scoped>
</style>
