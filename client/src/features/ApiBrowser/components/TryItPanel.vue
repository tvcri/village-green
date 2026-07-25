<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import ParamField from './ParamField.vue'
import { isOmitted } from '../lib/paramValues.js'
import { toCurl } from '../lib/curl.js'

const props = defineProps({
  // Empty until the user picks a row. The panel stays MOUNTED in that state so
  // its splitter pane keeps its height — v-if here would collapse the pane on
  // first paint and make the divider position meaningless until a selection.
  operationId: { type: String, default: '' },
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
  <div v-if="!operationId" class="tryit-panel tryit-empty">
    <p class="tryit-hint">Select an operation to try it out.</p>
  </div>

  <div v-else class="tryit-panel">
    <div class="tryit-header">
      <span class="op-id">{{ operationId }}</span>
      <Button
        label="Fetch"
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
/* No border-top: the splitter gutter above is now the visual seam. */
.tryit-panel {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-height: 0;
}
.tryit-empty {
  justify-content: center;
  align-items: center;
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
/* auto-FIT, not auto-fill: auto-fill keeps the empty tracks it created, so a
   single param renders at one-third width with dead space beside it and
   re-narrows every time a phantom column appears. auto-fit collapses empty
   tracks to zero and the 1fr tracks absorb the space, so one field spans the
   full width and two split it evenly.

   160px, not 220px: the left pane's floor is min-size="25", which on a 1280px
   viewport leaves only ~300px of grid — 220px tracks collapse to a single
   stacked column there. 160px keeps two columns at the narrowest the user can
   drag to, which is the point of a param grid. */
.param-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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
