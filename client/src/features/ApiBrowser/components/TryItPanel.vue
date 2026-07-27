<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import SplitButton from 'primevue/splitbutton'
import { useToast } from 'primevue/usetoast'
import ParamField from './ParamField.vue'
import { isOmitted } from '../lib/paramValues.js'
import { toCurl } from '../lib/curl.js'
import { toPython } from '../lib/python.js'

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

// Copy URL is the primary click — it's the most-used of the three (pasted into
// a browser, a ticket, a message) — with the code generators behind the
// chevron. Matches ExportButton.vue, where the common action fires on click.
//
// No method is passed: buildOperationRows lists GET operations only, so both
// generators' defaults are correct. They accept a method for when write
// operations are eventually supported.
//
// Adding a language later is one entry here plus one generator module.
const copyItems = computed(() => [
  {
    label: 'Copy as curl',
    // pi-desktop, NOT pi-terminal: there is no pi-terminal in PrimeIcons 7, so
    // that class rendered an empty box and left this label misaligned against
    // the Python entry's icon. Verify names against
    // node_modules/primeicons/primeicons.css before using them.
    icon: 'pi pi-desktop',
    command: () => copy(toCurl(props.resolved.url), 'curl command'),
  },
  {
    label: 'Copy as Python',
    icon: 'pi pi-code',
    command: () => copy(toPython(props.resolved.url), 'Python snippet'),
  },
])
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
      <SplitButton
        label="Copy"
        icon="pi pi-copy"
        severity="secondary"
        text
        size="small"
        :model="copyItems"
        :disabled="!resolved.url"
        v-tooltip.bottom="'Copy URL — or pick curl / Python (token never included)'"
        @click="copy(resolved.url, 'URL')"
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
/* The URL text is the flexible element (flex: 1 1 auto below); the copy
   control must not be squeezed to fit it when the pane is dragged narrow. */
.url-bar :deep(.p-splitbutton) {
  flex: 0 0 auto;
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
