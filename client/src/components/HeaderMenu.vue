<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import { useRouter, useRoute } from 'vue-router'
import { useCurrentUser } from '../shared/composables/useCurrentUser.js'
import { useAsyncState } from '../shared/composables/useAsyncState.js'
import { getUser } from '../shared/api/userApi.js'

defineProps({
  version: String
})

const router = useRouter()
const route = useRoute()
const menuRef = ref()
const { hasPermission } = useCurrentUser()

const { state: user, isLoading } = useAsyncState(
  () => getUser(),
  { immediate: true, onError: null }
)

const displayName = computed(() => user.value?.displayName || user.value?.username || 'User')
const email = computed(() => user.value?.email)
const status = computed(() => user.value?.status)

const isInAdmin = computed(() => {
  return route.name && route.name.startsWith('admin')
})

const adminLabel = computed(() => {
  return isInAdmin.value ? 'Home' : 'Admin'
})

const menuItems = computed(() => {
  const items = []

  if (hasPermission('user:admin')) {
    items.push({
      label: adminLabel.value,
      icon: isInAdmin.value ? 'pi pi-home' : 'pi pi-cog',
      command: handleAdminToggle
    })
  }

  items.push({
    label: 'Logout',
    icon: 'pi pi-sign-out',
    command: handleLogout
  })

  return items
})

function handleAdminToggle() {
  if (isInAdmin.value) {
    router.push({ name: 'villages' })
  } else {
    router.push({ name: 'admin' })
  }
}

function handleLogout() {
  if (VG?.oidcWorker?.logout) {
    VG.oidcWorker.logout()
  }
}

const toggleMenu = (event) => {
  menuRef.value.toggle(event)
}
</script>

<template>
  <div class="header-menu">
    <Button
      icon="pi pi-bars"
      text
      rounded
      aria-haspopup="true"
      aria-controls="header-menu-popup"
      @click="toggleMenu"
      title="Menu"
    />
    <Menu ref="menuRef" id="header-menu-popup" :model="menuItems" :popup="true">
      <template #start v-if="user && !isLoading">
        <div class="menu-user-section">
          <div class="menu-user-name">{{ user.displayName || user.username }}</div>
          <div v-if="email" class="menu-user-email">{{ email }}</div>
          <div v-if="status" class="menu-user-status">
            <span class="status-label">Status:</span>
            <span class="status-badge">{{ status }}</span>
          </div>
        </div>
      </template>
      <template #end>
        <div v-if="version" class="menu-version-section">
          v{{ version }}
        </div>
      </template>
    </Menu>
  </div>
</template>

<style scoped>
.header-menu {
  display: flex;
  align-items: center;
}

.menu-user-section {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border-default);
  margin-bottom: 0.5rem;
}

.menu-user-name {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.25rem;
}

.menu-user-email {
  font-size: 0.85rem;
  color: var(--color-text-dim);
  margin-bottom: 0.5rem;
  word-break: break-word;
}

.menu-user-status {
  font-size: 0.85rem;
  color: var(--color-text-dim);
  display: flex;
  gap: 0.5rem;
}

.status-label {
  color: var(--color-text-dim);
}

.status-badge {
  display: inline-block;
  padding: 0.2rem 0.4rem;
  background-color: var(--color-background-dark);
  border-radius: 3px;
  font-weight: 500;
  text-transform: capitalize;
}

.menu-version-section {
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--color-border-default);
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-dim);
  text-align: center;
}
</style>
