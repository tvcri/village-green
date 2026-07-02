<script setup>
import { useRouter } from 'vue-router'
import Button from 'primevue/button'

const router = useRouter()

const navigateToVillageAccess = () => {
  router.push({ name: 'admin-village-access' })
}

const navigateToUserAccess = () => {
  router.push({ name: 'admin-user-access' })
}

const navigateToAnalytics = () => {
  router.push({ name: 'admin-analytics' })
}

const navigateToPrivacy = () => {
  router.push({ name: 'admin-privacy' })
}
</script>

<template>
  <div class="admin-hub">
    <h1>Admin Panel</h1>
    <p class="subtitle">Manage access and grants for the Village Green system</p>

    <div class="button-group">
      <Button label="Village Access List" @click="navigateToVillageAccess" />
      <Button label="User Access List" @click="navigateToUserAccess" />
      <Button label="Analytics" @click="navigateToAnalytics" />
      <Button label="Privacy Rules" @click="navigateToPrivacy" />
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


@media (max-width: 400px) {
  .admin-hub {
    padding: 1rem;
  }

  h1 {
    font-size: 1.5rem;
  }

  .button-group {
    grid-template-columns: 1fr;
  }
}
</style>
