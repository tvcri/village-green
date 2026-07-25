<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import ParamField from './ParamField.vue'
import { isOmitted } from '../lib/paramValues.js'

const props = defineProps({
  operationId: { type: String, required: true },
  descriptors: { type: Array, required: true },
  values: { type: Object, required: true },
  isLoading: { type: Boolean, default: false },
})
const emit = defineEmits(['update:values', 'execute'])

const missingRequired = computed(() =>
  props.descriptors.filter(d => d.required && isOmitted(props.values[d.name])).map(d => d.name)
)

function setValue(name, value) {
  emit('update:values', { ...props.values, [name]: value })
}
</script>

<template>
  <div class="tryit-panel">
    <div class="tryit-header">
      <span class="op-id">{{ operationId }}</span>
      <Button
        label="Execute"
        icon="pi pi-play"
        :loading="isLoading"
        :disabled="missingRequired.length > 0 || isLoading"
        @click="emit('execute')"
      />
    </div>

    <p v-if="missingRequired.length" class="tryit-hint">
      Required: {{ missingRequired.join(', ') }}
    </p>

    <div v-if="descriptors.length" class="param-grid">
      <ParamField
        v-for="descriptor in descriptors"
        :key="descriptor.name"
        :descriptor="descriptor"
        :model-value="values[descriptor.name]"
        @update:model-value="setValue(descriptor.name, $event)"
      />
    </div>
    <p v-else class="tryit-hint">This operation takes no parameters.</p>
  </div>
</template>

<style scoped>
.tryit-panel {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border-top: 1px solid var(--color-border-default);
  padding-top: 0.75rem;
  min-height: 0;
}
.tryit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.op-id {
  font-family: ui-monospace, monospace;
  font-weight: 600;
}
.tryit-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-text-dim);
}
.param-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}
</style>
