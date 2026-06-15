<script setup>
const props = defineProps({
  origin: { type: String, required: true },
  destination: { type: String, required: true }
})

const mapsKey = window.VG?.Env?.google?.googleMapsKey ?? ''

function buildSrc(origin, destination) {
  const base = 'https://www.google.com/maps/embed/v1/directions'
  const params = new URLSearchParams({
    key: mapsKey,
    origin,
    destination,
    mode: 'driving'
  })
  return `${base}?${params.toString()}`
}
</script>

<template>
  <iframe
    v-if="origin && destination"
    :src="buildSrc(origin, destination)"
    title="Driving directions map"
    class="service-request-map"
    allowfullscreen
    loading="lazy"
    referrerpolicy="no-referrer-when-downgrade"
  />
</template>

<style scoped>
.service-request-map {
  width: 100%;
  height: 280px;
  border: none;
  border-radius: 8px;
  display: block;
}
</style>
