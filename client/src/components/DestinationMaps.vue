<script setup>
import { computed } from 'vue'

// One map holding every destination that has a place: [{ number, name, query }].
// Pin numbers match the "Destination N" headings, so a stop with no address
// leaves a gap rather than renumbering the rest. It is an image: Maps Embed can
// only show one pin, so the links carry anyone who wants to zoom or get directions.
const props = defineProps({
  places: { type: Array, required: true }
})

const mapsKey = VG?.Env?.google?.googleMapsKey ?? ''

// A marker label is one character, so stops past nine get a plain pin.
function markerParam ({ number, query }) {
  const label = number <= 9 ? `label:${number}|` : ''
  return `color:0x38669f|${label}${query}`
}

const imageSrc = computed(() => {
  const params = new URLSearchParams({ size: '640x400', scale: '2', key: mapsKey })
  // Several pins set their own zoom; a lone pin would zoom to the building.
  if (props.places.length === 1) params.append('zoom', '13')
  props.places.forEach(p => params.append('markers', markerParam(p)))
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`
})

const mapsLink = query => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
</script>

<template>
  <img :src="imageSrc" :alt="`Map of ${places.length === 1 ? 'the destination' : `${places.length} destinations`}`" class="destinations-map" referrerpolicy="no-referrer-when-downgrade" />
  <ul class="map-links">
    <li v-for="p in places" :key="p.number">
      <a :href="mapsLink(p.query)" target="_blank" rel="noopener" :aria-label="`Open ${p.name} in Google Maps`">
        <i class="pi pi-external-link" aria-hidden="true"></i>
        {{ p.number }}. {{ p.name }}
      </a>
    </li>
  </ul>
</template>

<style scoped>
.destinations-map {
  display: block;
  width: 100%;
  max-width: 720px;
  border-radius: 8px;
}

.map-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.9rem;
}

.map-links i {
  font-size: 0.8rem;
  margin-right: 0.15rem;
}
</style>
