<template>
  <div class="google-callback-container">
    <div class="callback-message">
      <p v-if="!callbackComplete">Authenticating with Google...</p>
      <p v-else>You may close this window.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const callbackComplete = ref(false);

onMounted(() => {
  // Extract code and state from URL
  const code = route.query.code;
  const state = route.query.state;
  const error = route.query.error;

  if (error) {
    console.error('OAuth error:', error);
    window.close();
    return;
  }

  if (code && state) {
    // Post message to the opener (main window) with the code
    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'GOOGLE_OAUTH_CODE',
          code,
          state,
        },
        window.location.origin
      );
    }

    callbackComplete.value = true;

    // Close the popup after a brief delay
    setTimeout(() => {
      window.close();
    }, 1000);
  }
});
</script>

<style scoped>
.google-callback-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #f5f5f5;
}

.callback-message {
  text-align: center;
  font-size: 16px;
  color: #333;
}
</style>
