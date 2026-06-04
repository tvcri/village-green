<script setup>
import { useTheme } from '../shared/composables/useTheme.js'

const { isDark, toggleTheme } = useTheme()
</script>

<template>
  <button
    class="theme-toggle"
    :title="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
    @click="toggleTheme"
  >
    <i :class="isDark ? 'pi pi-sun' : 'pi pi-moon'"></i>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s ease;
}

.theme-toggle:hover {
  background-color: var(--color-background-dark);
  border-color: var(--color-border-hover);
}

.theme-toggle i {
  font-size: 1.1rem;
}
</style>
