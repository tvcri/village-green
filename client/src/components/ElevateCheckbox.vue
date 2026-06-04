<script setup>
import { useElevate } from '../shared/composables/useElevate.js'

const { elevateEnabled, canElevate, toggleElevate } = useElevate()
</script>

<template>
  <div v-if="canElevate" class="elevate-checkbox">
    <label class="checkbox-label">
      <input
        type="checkbox"
        :checked="elevateEnabled"
        @change="toggleElevate"
      />
      <span>Elevate</span>
    </label>
  </div>
</template>

<style scoped>
.elevate-checkbox {
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--color-text-primary);
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  cursor: pointer;
}

.checkbox-label span {
  font-weight: 500;
}
</style>
