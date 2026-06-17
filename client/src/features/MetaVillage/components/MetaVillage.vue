<script setup>
import { useRouter } from 'vue-router'
import Button from 'primevue/button'

const router = useRouter()
</script>

<template>
  <div class="meta-village">
    <h1>Meta Village</h1>
    <Button label="Service Requests" @click="router.push({ name: 'meta-service-requests' })" />
    <Button label="Persons" @click="router.push({ name: 'meta-persons' })" />
  </div>
</template>

<style scoped>
.meta-village {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

h1 {
  margin: 0;
  color: var(--color-text-primary);
}
</style>
