<template>
  <div class="enroll-page">
    <header class="app-header">
      <div class="app-title-container">
        <img src="/tvcri-logo.svg" alt="Village Green Logo" class="app-logo" />
        <h1 class="app-title">Village Green</h1>
      </div>
    </header>
    <main class="enroll-main">
      <EnrollFlow />
    </main>
  </div>
</template>

<script setup>
import EnrollFlow from './EnrollFlow.vue'
</script>

<style scoped>
.enroll-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background-color: var(--color-background-light);
  border-bottom: 1px solid var(--color-border-default);
  height: 70px;
  flex-shrink: 0;
}

.app-title-container {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  flex: 1;
}

.app-logo {
  height: 50px;
  width: auto;
  flex-shrink: 0;
}

.app-title {
  margin: 0;
  line-height: 1;
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.enroll-main {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 2rem 1rem;
}

@media (max-width: 768px) {
  .app-header {
    padding: 0.75rem 1rem;
    height: 60px;
  }

  .app-title-container {
    gap: 0.75rem;
  }

  .app-logo {
    height: 40px;
  }

  .app-title {
    font-size: 1.5rem;
  }
}
</style>
