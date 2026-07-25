<script setup>
import Button from 'primevue/button'

defineProps({
  depth: { type: Number, default: 2 },
})
const emit = defineEmits(['expand-all', 'collapse-all', 'set-depth', 'copy'])
</script>

<template>
  <div class="jt-toolbar">
    <Button label="Expand all" size="small" severity="secondary" text @click="emit('expand-all')" />
    <Button label="Collapse all" size="small" severity="secondary" text @click="emit('collapse-all')" />
    <span class="jt-depth">
      Depth:
      <button v-for="n in 3" :key="n" :class="{ active: n === depth }" @click="emit('set-depth', n)">{{ n }}</button>
    </span>
    <Button label="Copy JSON" icon="pi pi-copy" size="small" severity="secondary" text @click="emit('copy')" />
  </div>
</template>

<style scoped>
.jt-toolbar {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.jt-depth {
  font-size: 0.78rem;
  color: var(--color-text-dim);
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.jt-depth button {
  background: none;
  border: 1px solid var(--color-border-default);
  border-radius: 3px;
  cursor: pointer;
  font: inherit;
  padding: 0 0.35rem;
  color: inherit;
}
.jt-depth button.active {
  background: var(--color-background-dark);
  font-weight: 700;
}
</style>
