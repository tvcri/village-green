<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const navigateToVillageAccess = () => {
  router.push({ name: 'admin-village-access' })
}

const navigateToUserAccess = () => {
  router.push({ name: 'admin-user-access' })
}
</script>

<template>
  <div class="admin-hub">
    <h1>Admin Panel</h1>
    <p class="subtitle">Manage access and grants for the Village Green system</p>

    <div class="button-group">
      <button class="nav-btn" @click="navigateToVillageAccess">
        Village Access List
      </button>
      <button class="nav-btn" @click="navigateToUserAccess">
        User Access List
      </button>
    </div>
  </div>
</template>

<style scoped>
.admin-hub {
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
}

h1 {
  margin: 0 0 1rem 0;
  color: var(--color-text-primary);
  font-size: 2rem;
}

.subtitle {
  margin: 0 0 2rem 0;
  color: var(--color-text-dim);
  font-size: 1rem;
}

.button-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.nav-btn {
  padding: 1rem 1.5rem;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
  text-align: center;
}

.nav-btn:hover {
  background-color: var(--color-primary-hover);
}

.nav-btn:active {
  background-color: var(--color-primary-active);
}

@media (max-width: 300px) {
  .admin-hub {
    padding: 1rem;
  }

  h1 {
    font-size: 1.5rem;
  }

  .button-group {
    grid-template-columns: 1fr;
  }

  .nav-btn {
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
  }
}
</style>
