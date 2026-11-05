<script setup>
import ServiceRequestMap from './ServiceRequestMap.vue'

// One stacked place map per destination: [{ name, query }].
defineProps({
  places: { type: Array, required: true }
})
</script>

<template>
  <template v-for="(p, i) in places" :key="i">
    <p class="map-route-label">{{ p.name }}</p>
    <ServiceRequestMap :place="p.query" class="place-map" />
  </template>
</template>

<style scoped>
.map-route-label {
  margin: 0 0 0.5rem 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1;
}

.place-map {
  margin-bottom: 1.5rem;
}
</style>
