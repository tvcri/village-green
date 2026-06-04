<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCurrentUser } from '../shared/composables/useCurrentUser.js'

const router = useRouter()
const route = useRoute()
const { isAdmin } = useCurrentUser()

const isInAdmin = computed(() => {
  return route.name && route.name.startsWith('admin')
})

const buttonLabel = computed(() => {
  return isInAdmin.value ? 'Home' : 'Admin'
})

const navigate = () => {
  if (isInAdmin.value) {
    router.push({ name: 'villages' })
  } else {
    router.push({ name: 'admin' })
  }
}
</script>

<template>
  <button v-if="isAdmin" class="nav-toggle-btn" @click="navigate">
    {{ buttonLabel }}
  </button>
</template>

<style scoped>
.nav-toggle-btn {
  padding: 0.5rem 1rem;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.nav-toggle-btn:hover {
  background-color: var(--color-primary-hover);
}

.nav-toggle-btn:active {
  background-color: var(--color-primary-active);
}
</style>
