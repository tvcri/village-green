<script setup>
import { computed } from 'vue'
import AccessTags from './AccessTags.vue'
import { buildAccessTags } from '../shared/lib/accessTagHelpers.js'

const props = defineProps({
  user: { type: Object, required: true },
})

const isGrantless = computed(() => buildAccessTags(props.user).length === 0)
</script>

<template>
  <div v-if="!isGrantless" class="my-access">
    <div class="my-access-title">My access</div>
    <AccessTags :user="user" />
  </div>
</template>

<style scoped>
.my-access {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border-default);
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
}

.my-access-title {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.35rem;
}
</style>
