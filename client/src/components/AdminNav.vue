<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Button from 'primevue/button'
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
  <Button v-if="isAdmin" :label="buttonLabel" @click="navigate" />
</template>

<style scoped>
</style>
