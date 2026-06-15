<script setup>
defineProps({
  address: { type: String, required: true }
})

const mapsKey = VG?.Env?.google?.googleMapsKey ?? ''

function buildSrc(address) {
  const base = 'https://www.google.com/maps/embed/v1/place'
  const params = new URLSearchParams({
    key: mapsKey,
    q: address
  })
  return `${base}?${params.toString()}`
}
</script>

<template>
  <iframe
    v-if="address"
    :src="buildSrc(address)"
    title="Person location map"
    class="person-map"
    allowfullscreen
    loading="lazy"
    referrerpolicy="no-referrer-when-downgrade"
  />
</template>

<style scoped>
.person-map {
  width: 100%;
  height: 400px;
  border: none;
  border-radius: 8px;
  display: block;
}
</style>
