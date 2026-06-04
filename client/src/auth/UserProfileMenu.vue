<script setup>
import { computed, ref } from 'vue'
import { useAsyncState } from '../shared/composables/useAsyncState.js'
import { getUser } from '../shared/api/userApi.js'

const isOpen = ref(false)

const { state: user, isLoading } = useAsyncState(
  () => getUser(),
  { immediate: true, onError: null }
)

const displayName = computed(() => user.value?.displayName || user.value?.username || 'User')
const email = computed(() => user.value?.email)
const status = computed(() => user.value?.status)
</script>

<template>
  <div class="user-profile-menu">
    <button class="profile-btn" @click="isOpen = !isOpen">
      <i class="pi pi-user"></i>
      <span class="display-name">{{ displayName }}</span>
      <i class="pi pi-chevron-down"></i>
    </button>

    <transition name="dropdown">
      <div v-if="isOpen" class="dropdown-menu">
        <div v-if="isLoading" class="menu-item loading">
          Loading...
        </div>
        <div v-else-if="user" class="menu-content">
          <div class="user-info">
            <div class="user-name">{{ user.displayName || user.username }}</div>
            <div v-if="email" class="user-email">{{ email }}</div>
            <div v-if="status" class="user-status">
              Status: <span class="status-badge">{{ status }}</span>
            </div>
          </div>
          <div class="menu-divider"></div>
          <button class="menu-item logout-btn" @click="handleLogout">
            <i class="pi pi-sign-out"></i>
            Logout
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
function handleLogout() {
  if (window.VG?.oidcWorker?.logout) {
    window.VG.oidcWorker.logout()
  }
}
</script>

<style scoped>
.user-profile-menu {
  position: relative;
}

.profile-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.profile-btn:hover {
  background-color: var(--color-background-dark);
  border-color: var(--color-border-hover);
}

.profile-btn i {
  font-size: 1rem;
}

.display-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  min-width: 250px;
  z-index: 1000;
}

.menu-content {
  padding: 0.75rem 0;
}

.user-info {
  padding: 0.75rem 1rem;
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

.menu-divider {
  height: 1px;
  background-color: var(--color-border-default);
  margin: 0.5rem 0;
}

.menu-item {
  padding: 0.75rem 1rem;
  color: var(--color-text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  transition: background-color 0.15s ease;
}

.menu-item:hover:not(.loading) {
  background-color: var(--color-background-dark);
}

.menu-item.loading {
  cursor: default;
  color: var(--color-text-dim);
}

.logout-btn {
  width: 100%;
  border: none;
  justify-content: flex-start;
  color: var(--color-text-error, #ef4444);
}

.logout-btn:hover {
  background-color: rgba(239, 68, 68, 0.1);
}

/* Dropdown animation */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
