<script setup>
import ReauthPrompt from './auth/ReauthPrompt.vue'
import UserProfileMenu from './auth/UserProfileMenu.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import ElevateCheckbox from './components/ElevateCheckbox.vue'
import Breadcrumbs from './components/Breadcrumbs.vue'
import { useOidcWorker } from './auth/useOidcWorker.js'
import GlobalErrorModal from './components/global/GlobalErrorModal.vue'

const oidcWorker = useOidcWorker()
</script>

<template>
  <div class="app-container">
    <GlobalErrorModal />
    <ReauthPrompt
      v-if="oidcWorker.noTokenMessage.value"
      :redirect-oidc="oidcWorker.noTokenMessage.value?.redirectOidc"
      :code-verifier="oidcWorker.noTokenMessage.value?.codeVerifier"
      :state="oidcWorker.noTokenMessage.value?.state"
    />

    <header class="app-header">
      <div class="header-left">
        <h1 class="app-title">Village Green</h1>
      </div>
      <div class="header-right">
        <ElevateCheckbox />
        <ThemeToggle />
        <UserProfileMenu />
      </div>
    </header>

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
  height: 100vh;
  overflow: hidden;
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

.header-left {
  flex: 1;
}

.app-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.app-main {
  flex: 1;
  overflow: auto;
  background-color: var(--color-background-dark);
}

@media (max-width: 768px) {
  .app-header {
    padding: 0.75rem 1rem;
    height: 60px;
  }

  .app-title {
    font-size: 1.25rem;
  }
}
</style>
