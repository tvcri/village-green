<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import { useAsyncState } from '../shared/composables/useAsyncState.js'
import { getUser } from '../shared/api/userApi.js'

const menuRef = ref()
const isOpen = ref(false)

const { state: user, isLoading } = useAsyncState(
  () => getUser(),
  { immediate: true, onError: null }
)

const displayName = computed(() => user.value?.displayName || user.value?.username || 'User')
const email = computed(() => user.value?.email)
const status = computed(() => user.value?.status)

const menuItems = computed(() => [
  {
    label: 'Logout',
    icon: 'pi pi-sign-out',
    command: handleLogout
  }
])

function handleLogout() {
  if (window.VG?.oidcWorker?.logout) {
    window.VG.oidcWorker.logout()
  }
}

const toggleMenu = (event) => {
  menuRef.value.toggle(event)
}
</script>

<template>
  <div class="user-profile-menu">
    <Button
      :label="displayName"
      icon="pi pi-user"
      variant="outlined"
      @click="toggleMenu"
      aria-haspopup="true"
      aria-controls="profile-menu"
    />
    <Menu ref="menuRef" id="profile-menu" :model="menuItems" :popup="true">
      <template #start v-if="user && !isLoading">
        <div class="user-info">
          <div class="user-name">{{ user.displayName || user.username }}</div>
          <div v-if="email" class="user-email">{{ email }}</div>
          <div v-if="status" class="user-status">
            Status: <span class="status-badge">{{ status }}</span>
          </div>
        </div>
      </template>
    </Menu>
  </div>
</template>

<style scoped>
.user-info {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border-default);
  margin-bottom: 0.5rem;
}

.user-name {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.25rem;
}

.user-email {
  font-size: 0.85rem;
  color: var(--color-text-dim);
  margin-bottom: 0.5rem;
  word-break: break-word;
}

.user-status {
  font-size: 0.85rem;
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
</style>
