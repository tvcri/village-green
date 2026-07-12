<script setup>
import { computed } from 'vue'
import Tag from 'primevue/tag'
import { buildAccessTags } from '../lib/accessTagHelpers.js'

const props = defineProps({
  user: { type: Object, required: true },
})

const tags = computed(() => buildAccessTags(props.user))
</script>

<template>
  <div class="access-tags">
    <span v-if="tags.length === 0" class="no-access">—</span>
    <Tag
      v-for="tag in tags"
      :key="tag.key"
      :value="tag.text"
      :severity="tag.scopeType === 'hub' ? 'contrast' : 'success'"
      :title="tag.title"
      :aria-label="tag.title"
    />
  </div>
</template>

<style scoped>
.access-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.no-access {
  color: var(--color-text-dim);
}
</style>
