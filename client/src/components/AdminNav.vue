<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Button from 'primevue/button'
import { useCurrentUser } from '../shared/composables/useCurrentUser.js'

const router = useRouter()
const route = useRoute()
const { hasPermission } = useCurrentUser()
const isAdmin = computed(() => hasPermission('user:admin'))

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

const isOnAnalytics = computed(() => route.name === 'admin-analytics')

const navigateToAnalytics = () => {
  router.push({ name: 'admin-analytics' })
}
</script>

<template>
  <Button v-if="isAdmin" :label="buttonLabel" @click="navigate" />
  <Button v-if="isAdmin && isInAdmin && !isOnAnalytics" label="Analytics" @click="navigateToAnalytics" />
</template>

<style scoped>
</style>
