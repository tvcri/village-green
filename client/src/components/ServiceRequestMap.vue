<script setup>
const props = defineProps({
  origin: { type: String, required: true },
  destination: { type: String, required: true },
  waypoint: { type: String, default: '' }
})

const mapsKey = VG?.Env?.google?.googleMapsKey ?? ''

function buildSrc(origin, destination, waypoint) {
  const base = 'https://www.google.com/maps/embed/v1/directions'
  const params = new URLSearchParams({
    key: mapsKey,
    origin,
    destination,
    mode: 'driving'
  })
  if (waypoint) params.append('waypoints', waypoint)
  return `${base}?${params.toString()}`
}
</script>

<template>
  <iframe
    v-if="origin && destination"
    :src="buildSrc(origin, destination, waypoint)"
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
  height: 400px;
  border: none;
  border-radius: 8px;
  display: block;
}
</style>
