<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import ProgressSpinner from 'primevue/progressspinner'
import { MAX_TREE_BYTES } from '../lib/responseMeta.js'

const props = defineProps({
  result: { type: Object, default: null },
  isLoading: { type: Boolean, default: false },
  operationId: { type: String, default: '' },
})

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

      <pre v-else class="raw-body">{{ result.raw }}</pre>
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
.raw-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 0.6rem;
  font-size: 0.78rem;
  background: var(--color-background-dark);
  border-radius: 4px;
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
  color: var(--color-danger, #dc2626);
}
</style>
