<script setup>
defineProps({
  origin: { type: String, default: '' },
  destination: { type: String, default: '' },
  // When set, shows a single place and origin/destination are ignored.
  place: { type: String, default: '' },
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

function buildPlaceSrc(place) {
  const params = new URLSearchParams({ key: mapsKey, q: place })
  return `https://www.google.com/maps/embed/v1/place?${params.toString()}`
}
</script>

<template>
  <iframe
    v-if="place"
    :src="buildPlaceSrc(place)"
    title="Map of destination"
    class="service-request-map"
    allowfullscreen
    loading="lazy"
    referrerpolicy="no-referrer-when-downgrade"
  />
  <iframe
    v-else-if="origin && destination"
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
