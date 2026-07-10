<script setup>
import { computed } from 'vue'

const props = defineProps({
  user: { type: Object, required: true },
})

const hubRoleNames = computed(() =>
  (props.user.federationGrants ?? []).map(g => g.name).join(', ')
)

const villageLines = computed(() =>
  Object.values(props.user.grants ?? {})
    .map(g => ({
      villageId: g.villageId,
      name: g.name,
      roles: (g.roles ?? []).map(r => r.name).join(', '),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
)

const isGrantless = computed(() => !hubRoleNames.value && villageLines.value.length === 0)
</script>

<template>
  <div class="my-access">
    <div class="my-access-title">My access</div>
    <div v-if="isGrantless" class="my-access-empty">No access grants</div>
    <template v-else>
      <div v-if="hubRoleNames" class="my-access-line">
        <span class="my-access-scope">Hub:</span>
        <span>{{ hubRoleNames }}</span>
        <span v-if="user.canElevate" class="elevate-tag">elevation available</span>
      </div>
      <div v-for="line in villageLines" :key="line.villageId" class="my-access-line">
        <span class="my-access-scope">{{ line.name }}:</span>
        <span>{{ line.roles }}</span>
      </div>
    </template>
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

.my-access-empty {
  color: var(--color-text-dim);
  font-style: italic;
}

.my-access-line {
  color: var(--color-text-dim);
  display: flex;
  gap: 0.4rem;
  align-items: baseline;
  flex-wrap: wrap;
  margin-bottom: 0.2rem;
}

.my-access-scope {
  color: var(--color-text-primary);
  font-weight: 500;
}

.elevate-tag {
  display: inline-block;
  padding: 0.1rem 0.35rem;
  background-color: var(--color-background-dark);
  border-radius: 3px;
  font-size: 0.75rem;
}
</style>
