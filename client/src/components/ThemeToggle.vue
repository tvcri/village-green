<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import { useTheme } from '../shared/composables/useTheme.js'

const { mode } = useTheme()

// Single icon that cycles Light → Dark → Browser. The icon shows the
// CURRENT mode; the tooltip names it and the next stop in the cycle.
const MODES = [
  { value: 'light', icon: 'pi pi-sun', label: 'Light' },
  { value: 'dark', icon: 'pi pi-moon', label: 'Dark' },
  { value: 'system', icon: 'pi pi-desktop', label: 'Browser' },
]

const current = computed(() => MODES.find(m => m.value === mode.value) ?? MODES[2])
const next = computed(() => MODES[(MODES.indexOf(current.value) + 1) % MODES.length])

function cycle () {
  mode.value = next.value.value
}
</script>

<template>
  <Button
    :icon="current.icon"
    text
    rounded
    :aria-label="`Theme: ${current.label}. Activate to switch to ${next.label}`"
    v-tooltip.bottom="`Theme: ${current.label} — click for ${next.label}`"
    @click="cycle"
  />
</template>

<style scoped>
</style>
