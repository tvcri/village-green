<script setup>
import Button from 'primevue/button'
import { useTheme } from '../shared/composables/useTheme.js'

const { isDark, toggleTheme } = useTheme()
</script>

<template>
  <Button
    :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'"
    text
    rounded
    :title="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
    @click="toggleTheme"
  />
</template>

<style scoped>
</style>
