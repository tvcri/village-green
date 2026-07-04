<script setup>
import { computed, onMounted } from 'vue'
import Toast from 'primevue/toast'
import ReauthPrompt from './auth/ReauthPrompt.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import HeaderMenu from './components/HeaderMenu.vue'
import Breadcrumbs from './components/Breadcrumbs.vue'
import { useOidcWorker } from './auth/useOidcWorker.js'
import GlobalErrorModal from './components/global/GlobalErrorModal.vue'
import PrivacyAckModal from './components/PrivacyAckModal.vue'
import { usePrivacyAck } from './shared/composables/usePrivacyAck.js'

const { needsAck } = usePrivacyAck()
const oidcWorker = useOidcWorker()
const version = computed(() => VG?.Env?.version || '')
const isDev = VG?.Env?.nodeEnv === 'development'

onMounted(() => {
  document.getElementById('loading-mask')?.remove()
})
</script>

<template>
  <div v-if="isDev" class="dev-instance" aria-hidden="true">TEST DEPLOYMENT</div>
  <div class="app-container">
    <Toast />
    <GlobalErrorModal />
    <PrivacyAckModal />
    <ReauthPrompt
      v-if="oidcWorker.noTokenMessage.value"
      :redirect-oidc="oidcWorker.noTokenMessage.value?.redirectOidc"
      :code-verifier="oidcWorker.noTokenMessage.value?.codeVerifier"
      :state="oidcWorker.noTokenMessage.value?.state"
    />

    <header class="app-header">
      <div class="app-title-container">
        <img src="/tvcri-logo.svg" alt="Village Green Logo" class="app-logo" />
        <h1 class="app-title">Village Green</h1>
      </div>
      <div class="header-controls">
        <ThemeToggle />
        <HeaderMenu :version="version" />
      </div>
    </header>

    <Breadcrumbs />

    <main class="app-main">
      <router-view v-if="!needsAck" v-slot="{ Component }">
        <keep-alive include="MetaServiceRequestList,VillageServiceRequestList,MemberList,VolunteerList,PersonList">
          <component :is="Component" />
        </keep-alive>
      </router-view>
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

.dev-instance {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  margin: 0 auto;
  max-width: 1200px;
  height: 20px;
  background-color: #783d1022;
  pointer-events: none;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  /* color: #fff; */
  font-size: 12px;
  font-weight: 700;
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

.header-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
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
}
</style>
