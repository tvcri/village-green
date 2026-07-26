<script setup>
import { computed, ref } from 'vue'
import { childNodes, isContainer, previewOf, summaryOf, typeOf } from '../lib/jsonTreeModel.js'

defineOptions({ name: 'JsonTree' })

const props = defineProps({
  value: { type: null, required: true },
  path: { type: String, default: '$' },
  label: { type: String, default: '' },
  expanded: { type: Set, required: true },
  limits: { type: Map, required: true },
})
const emit = defineEmits(['toggle', 'more'])

const DEFAULT_LIMIT = 200
const LONG_STRING = 200

const showFullString = ref(false)

const container = computed(() => isContainer(props.value))
const open = computed(() => props.expanded.has(props.path))
const limit = computed(() => props.limits.get(props.path) ?? DEFAULT_LIMIT)
const children = computed(() => (container.value ? childNodes(props.value, props.path, limit.value) : { nodes: [], hidden: 0 }))

const valueType = computed(() => typeOf(props.value))

// Only while collapsed: an expanded node shows its real contents right below,
// so a preview beside it would be redundant noise.
const preview = computed(() => (container.value && !open.value ? previewOf(props.value) : ''))
const isLongString = computed(() => valueType.value === 'string' && props.value.length > LONG_STRING)
const displayValue = computed(() => {
  if (valueType.value === 'string') {
    return isLongString.value && !showFullString.value
      ? `"${props.value.slice(0, LONG_STRING)}…"`
      : `"${props.value}"`
  }
  return String(props.value)
})
</script>

<template>
  <div class="jt-node">
    <div class="jt-line">
      <button
        v-if="container"
        class="jt-caret"
        :aria-expanded="open"
        :aria-label="open ? 'Collapse' : 'Expand'"
        @click="emit('toggle', path)"
      >
        <i :class="open ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" />
      </button>
      <span v-else class="jt-caret-spacer" />

      <span v-if="label" class="jt-key">{{ label }}</span>
      <span v-if="label" class="jt-sep">:</span>

      <!-- Containers: count, then a preview while collapsed. The preview is a
           SEPARATE element, not part of the chain below — splicing it into the
           v-else-if made the empty-container branch fire on expanded nodes and
           render the count a second time ({7} {7}). -->
      <template v-if="container">
        <span class="jt-size">{{ summaryOf(value) }}</span>
        <span v-if="preview" class="jt-preview">{{ preview }}</span>
      </template>
      <span v-else-if="valueType === 'array' || valueType === 'object'" class="jt-size">{{ valueType === 'array' ? '[]' : '{}' }}</span>
      <span v-else class="jt-value" :class="`jt-${valueType}`">{{ displayValue }}</span>

      <button v-if="isLongString" class="jt-more" @click="showFullString = !showFullString">
        {{ showFullString ? 'less' : 'more' }}
      </button>
    </div>

    <div v-if="container && open" class="jt-children">
      <JsonTree
        v-for="child in children.nodes"
        :key="child.path"
        :value="child.value"
        :path="child.path"
        :label="child.key"
        :expanded="expanded"
        :limits="limits"
        @toggle="emit('toggle', $event)"
        @more="emit('more', $event)"
      />
      <button v-if="children.hidden > 0" class="jt-more-rows" @click="emit('more', path)">
        … {{ children.hidden }} more
      </button>
    </div>
  </div>
</template>

<style scoped>
.jt-line {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  white-space: pre-wrap;
  word-break: break-word;
}
.jt-children {
  padding-left: 18px;
}
.jt-caret,
.jt-more,
.jt-more-rows {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--color-text-dim);
  font: inherit;
}
.jt-caret {
  width: 14px;
  flex: 0 0 auto;
  font-size: 0.7rem;
}
.jt-caret-spacer {
  width: 14px;
  flex: 0 0 auto;
}
.jt-key {
  color: var(--jt-key);
  font-weight: 600;
}
.jt-sep {
  color: var(--color-text-dim);
}
.jt-size {
  color: var(--color-text-dim);
}
/* Subordinate to real values: this is a hint about what's inside, not the
   data itself, so it must not compete with the type-colored values below it
   once the node is expanded. Clipped rather than wrapped — a preview that
   wraps to a second line defeats the purpose of a one-line summary. */
.jt-preview {
  color: var(--color-text-dim);
  opacity: 0.75;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.jt-string { color: var(--jt-string); }
.jt-number { color: var(--jt-number); }
.jt-boolean { color: var(--jt-bool); }
.jt-null,
.jt-undefined {
  color: var(--jt-null);
  font-style: italic;
}
.jt-more,
.jt-more-rows {
  text-decoration: underline;
  font-size: 0.72rem;
}
</style>
