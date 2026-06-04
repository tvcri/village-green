<script setup>
</script>

<template>
  <div class="user-access-list">
    <h1>User Access List</h1>
    <p class="placeholder">User Access List functionality coming soon...</p>
  </div>
</template>

<style scoped>
.user-access-list {
  padding: 2rem;
}

h1 {
  margin: 0 0 2rem 0;
  color: var(--color-text-primary);
  font-size: 1.5rem;
}

.placeholder {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-dim);
  font-size: 1rem;
  font-style: italic;
}

@media (max-width: 768px) {
  .user-access-list {
    padding: 1rem;
  }

  h1 {
    font-size: 1.25rem;
  }
}
</style>
