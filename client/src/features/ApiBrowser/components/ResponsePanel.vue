<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import ProgressSpinner from 'primevue/progressspinner'
import { useToast } from 'primevue/usetoast'
import JsonTree from './JsonTree.vue'
import JsonTreeToolbar from './JsonTreeToolbar.vue'
import { pathsToDepth } from '../lib/jsonTreeModel.js'
import { MAX_TREE_BYTES } from '../lib/responseMeta.js'

const props = defineProps({
  result: { type: Object, default: null },
  isLoading: { type: Boolean, default: false },
  operationId: { type: String, default: '' },
})

const toast = useToast()
const expanded = ref(new Set())
const limits = ref(new Map())
const depth = ref(2)

watch(() => props.result, next => {
  limits.value = new Map()
  expanded.value = next?.isJson ? pathsToDepth(next.body, depth.value) : new Set()
})

function onToggle(path) {
  const set = new Set(expanded.value)
  if (set.has(path)) set.delete(path)
  else set.add(path)
  expanded.value = set
}

function onMore(path) {
  const map = new Map(limits.value)
  map.set(path, (map.get(path) ?? 200) + 200)
  limits.value = map
}

function setDepth(n) {
  depth.value = n
  expanded.value = pathsToDepth(props.result?.body, n)
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.result.body, null, 2))
    toast.add({ severity: 'success', summary: 'JSON copied', life: 1500 })
  }
  catch {
    toast.add({ severity: 'error', summary: 'Could not copy JSON', life: 3000 })
  }
}

const severity = computed(() => {
  const status = props.result?.status
  if (status === null || status === undefined) return 'danger'
  if (status < 300) return 'success'
  // 4xx is amber, NOT red — a 403 is a valid, informative answer here.
  if (status < 500) return 'warn'
  return 'danger'
})

const sizeLabel = computed(() => {
  const bytes = props.result?.bytes ?? 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
})

const tooBig = computed(() => (props.result?.bytes ?? 0) > MAX_TREE_BYTES)

function download() {
  const text = props.result.isJson ? JSON.stringify(props.result.body, null, 2) : props.result.raw
  const blob = new Blob([text], { type: props.result.contentType || 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.operationId || 'response'}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="response-panel">
    <div v-if="isLoading" class="response-center"><ProgressSpinner style="width: 2.5rem" /></div>

    <template v-else-if="result">
      <div class="meta-strip">
        <Tag :value="result.status === null ? 'ERROR' : String(result.status)" :severity="severity" />
        <span class="meta-item">{{ Math.round(result.ms) }} ms</span>
        <span class="meta-item">{{ sizeLabel }}</span>
        <span class="meta-item ct">{{ result.contentType || '—' }}</span>
        <span class="spacer" />
        <Button label="Download" icon="pi pi-download" size="small" severity="secondary" @click="download" />
      </div>

      <p v-if="result.transport" class="transport-error">{{ result.statusText }}</p>

      <p v-else-if="!result.isJson" class="notice">
        Non-JSON response ({{ result.contentType || 'unknown type' }}, {{ sizeLabel }}) — use Download.
      </p>

      <p v-else-if="tooBig" class="notice">
        Response is {{ sizeLabel }}, too large to render as a tree — use Download.
      </p>

      <template v-else>
        <JsonTreeToolbar
          :depth="depth"
          @expand-all="expanded = pathsToDepth(result.body, Infinity)"
          @collapse-all="expanded = new Set()"
          @set-depth="setDepth"
          @copy="copyJson"
        />
        <div class="tree-region json-tree">
          <JsonTree
            :value="result.body"
            path="$"
            :expanded="expanded"
            :limits="limits"
            @toggle="onToggle"
            @more="onMore"
          />
        </div>
      </template>
    </template>

    <div v-else class="response-center muted">
      Select an operation and execute it to see the response here
    </div>
  </div>
</template>

<style scoped>
.response-panel {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  height: 100%;
  min-height: 0;
}
.meta-strip {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.meta-item {
  font-size: 0.8rem;
  color: var(--color-text-dim);
}
.meta-item.ct {
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
}
.spacer {
  flex: 1 1 auto;
}
.response-center {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.response-center.muted,
.notice {
  color: var(--color-text-dim);
}
.transport-error {
  color: var(--color-status-error-text);
}
.tree-region {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0.6rem;
  background: var(--color-background-dark);
  border-radius: 4px;
}
/* Type colors as custom properties, defined once and overridden in a single
   dark block rather than per-rule. All selectors stay under .json-tree. */
.json-tree {
  --jt-key: #7c3aed;
  --jt-string: #16a34a;
  --jt-number: #2563eb;
  --jt-bool: #c2410c;
  --jt-null: var(--color-text-dim);
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  line-height: 1.5;
}
:global(:root.app-dark) .json-tree {
  --jt-key: #c4b5fd;
  --jt-string: #86efac;
  --jt-number: #93c5fd;
  --jt-bool: #fdba74;
}
</style>
