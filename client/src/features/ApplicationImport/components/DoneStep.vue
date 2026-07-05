<script setup>
import Button from 'primevue/button'
import { useRouter } from 'vue-router'

defineProps({
  created: { type: Array, required: true },
})
defineEmits(['restart'])

const router = useRouter()
</script>

<template>
  <div>
    <h3>Import complete</h3>
    <ul class="done-list">
      <li v-for="c in created" :key="c.personId">
        <router-link :to="{ name: 'meta-person-detail', params: { personId: c.personId } }">
          {{ c.fullName }}
        </router-link>
        — {{ c.existing ? 'existing person' : 'person created' }},
        {{ c.memberGranted ? 'member role saved' : 'member role not saved' }}
      </li>
    </ul>
    <div class="done-footer">
      <Button label="Import Another" severity="secondary" @click="$emit('restart')" />
      <Button label="Back to Persons" @click="router.push({ name: 'meta-persons' })" />
    </div>
  </div>
</template>

<style scoped>
.done-list { margin: 1rem 0; padding-left: 1.25rem; }
.done-footer { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.5rem; }
</style>
