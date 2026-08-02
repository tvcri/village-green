<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import { useTheme } from '../shared/composables/useTheme.js'

const { mode } = useTheme()

const MODES = [
  { value: 'light', icon: 'pi pi-sun', label: 'Light' },
  { value: 'dark', icon: 'pi pi-moon', label: 'Dark' },
  { value: 'system', icon: 'pi pi-desktop', label: 'Browser' },
]

const current = computed(() => MODES.find(m => m.value === mode.value) ?? MODES[2])

const menu = ref()
const items = MODES.map(m => ({
  label: m.label,
  icon: m.icon,
  value: m.value,
  command: () => { mode.value = m.value },
}))

function toggle (event) {
  menu.value.toggle(event)
}
</script>

<template>
  <Button
    :icon="current.icon"
    text
    rounded
    aria-haspopup="true"
    aria-controls="theme-menu"
    :aria-label="`Theme: ${current.label}`"
    v-tooltip.bottom="'Theme'"
    @click="toggle"
  />
  <Menu ref="menu" id="theme-menu" :model="items" :popup="true">
    <template #item="{ item, props }">
      <a class="theme-item" v-bind="props.action">
        <span :class="item.icon" />
        <span>{{ item.label }}</span>
        <i v-if="item.value === mode" class="pi pi-check theme-check" />
      </a>
    </template>
  </Menu>
</template>

<style scoped>
.theme-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.theme-check {
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--p-primary-color);
}
</style>
