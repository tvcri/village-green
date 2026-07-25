<script setup>
</script>

<template>
  <div class="api-browser">
    <h1>API Browser</h1>
  </div>
</template>

<style scoped>
.api-browser {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  /* Viewport-bounded so the Splitter has a height to fill; the app shell is
     min-height:100dvh and gives no definite height. 115px = header (70px) +
     breadcrumbs (~45px). Matches SqlConsole. */
  height: calc(100dvh - 115px);
  box-sizing: border-box;
}
</style>
