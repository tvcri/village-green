<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import ParamField from './ParamField.vue'
import { isOmitted } from '../lib/paramValues.js'
import { toCurl } from '../lib/curl.js'

const props = defineProps({
  operationId: { type: String, required: true },
  descriptors: { type: Array, required: true },
  values: { type: Object, required: true },
  isLoading: { type: Boolean, default: false },
  resolved: { type: Object, default: () => ({ url: '', hint: '' }) },
})
const emit = defineEmits(['update:values', 'execute'])

const toast = useToast()

const missingRequired = computed(() =>
  props.descriptors.filter(d => d.required && isOmitted(props.values[d.name])).map(d => d.name)
)

function setValue(name, value) {
  emit('update:values', { ...props.values, [name]: value })
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ severity: 'success', summary: `${what} copied`, life: 1500 })
  }
  catch {
    toast.add({ severity: 'error', summary: `Could not copy ${what.toLowerCase()}`, life: 3000 })
  }
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

    <div class="url-bar">
      <code v-if="resolved.url" class="url-text">{{ resolved.url }}</code>
      <code v-else class="url-text muted">{{ resolved.hint || '—' }}</code>
      <Button
        icon="pi pi-copy"
        severity="secondary"
        text
        aria-label="Copy URL"
        v-tooltip.bottom="'Copy URL'"
        :disabled="!resolved.url"
        @click="copy(resolved.url, 'URL')"
      />
      <Button
        label="curl"
        icon="pi pi-terminal"
        severity="secondary"
        text
        v-tooltip.bottom="'Copy as curl (token redacted as $TOKEN)'"
        :disabled="!resolved.url"
        @click="copy(toCurl(resolved.url), 'curl command')"
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
.url-bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}
.url-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  font-size: 0.78rem;
  background: var(--color-background-dark);
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
}
.url-text.muted {
  color: var(--color-text-dim);
}
</style>
