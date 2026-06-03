<script setup>
import ReauthPrompt from './auth/ReauthPrompt.vue'
import { useOidcWorker } from './auth/useOidcWorker.js'
import GlobalErrorModal from './components/global/GlobalErrorModal.vue'

const oidcWorker = useOidcWorker()
</script>

<template>
  <GlobalErrorModal />
  <ReauthPrompt
    v-if="oidcWorker.noTokenMessage.value"
    :redirect-oidc="oidcWorker.noTokenMessage.value?.redirectOidc"
    :code-verifier="oidcWorker.noTokenMessage.value?.codeVerifier"
    :state="oidcWorker.noTokenMessage.value?.state"
  />
  <router-view />
</template>
