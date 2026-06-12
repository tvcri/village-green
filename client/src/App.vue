<script setup>
import { computed } from 'vue'
import Toast from 'primevue/toast'
import ReauthPrompt from './auth/ReauthPrompt.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import HeaderMenu from './components/HeaderMenu.vue'
import Breadcrumbs from './components/Breadcrumbs.vue'
import { useOidcWorker } from './auth/useOidcWorker.js'
import GlobalErrorModal from './components/global/GlobalErrorModal.vue'
import { useStateWorker } from './auth/useStateWorker.js'

const oidcWorker = useOidcWorker()
const { state } = useStateWorker()
const version = computed(() => VG?.Env?.version || '')
const ceDumpTime = computed(() => {
  const time = state.value?.ceDumpTime
  if (!time) return null
  return new Date(time).toLocaleString()
})
</script>

<template>
  <div class="app-container">
    <Toast />
    <GlobalErrorModal />
    <ReauthPrompt
      v-if="oidcWorker.noTokenMessage.value"
      :redirect-oidc="oidcWorker.noTokenMessage.value?.redirectOidc"
      :code-verifier="oidcWorker.noTokenMessage.value?.codeVerifier"
      :state="oidcWorker.noTokenMessage.value?.state"
    />

    <header class="app-header">
      <div class="app-title-container">
        <img src="/house.svg" alt="Village Green Logo" class="app-logo" />
        <h1 class="app-title">Village Green</h1>
      </div>
      <div class="header-controls">
        <ThemeToggle />
        <HeaderMenu :version="version" />
      </div>
    </header>

    <div class="sync-status-bar">
      <template v-if="ceDumpTime">Updated: {{ ceDumpTime }}</template>
    </div>

    <Breadcrumbs />

    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>

.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  margin: 0 auto;
  max-width: 1200px;
  width: 100%;
  border-left: 1px solid var(--color-border-light);
  border-right: 1px solid var(--color-border-light);
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
  align-items: center;
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
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
}

.sync-status-bar {
  padding: 0.5rem 2rem;
  background-color: var(--color-background-light);
  border-bottom: 1px solid var(--color-border-default);
  font-size: 0.8rem;
  color: var(--color-text-dim);
  flex-shrink: 0;
}

.app-main {
  flex: 1;
  background-color: var(--color-background-dark);
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

  .header-controls {
    gap: 0.5rem;
  }

  .sync-status-bar {
    padding: 0.5rem 1rem;
  }
}
</style>
