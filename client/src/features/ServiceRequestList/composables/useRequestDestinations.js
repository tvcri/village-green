import { computed } from 'vue'
import { placeQuery } from '../lib/destinations.js'

// The destination-derived map state shared by the staff and volunteer request
// detail pages. Each page supplies its own origin; routes, waypoints and the
// show/hide toggle stay with the page.
export function useRequestDestinations (request, mapOrigin) {
  const destinations = computed(() => request.value?.destinations ?? [])
  const isMulti = computed(() => destinations.value.length > 1)
  // One place map per destination that has an address or city.
  const mappedPlaces = computed(() =>
    destinations.value
      .map((d, i) => ({ name: d.destination || `Destination ${i + 1}`, query: placeQuery(d) }))
      .filter(p => p.query)
  )
  const mapDestination = computed(() => placeQuery(destinations.value[0]))
  const showMapSection = computed(() =>
    isMulti.value ? mappedPlaces.value.length > 0 : !!(mapOrigin.value && mapDestination.value)
  )
  return { destinations, isMulti, mappedPlaces, mapDestination, showMapSection }
}
