<script setup>
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { searchPlaces } from '../api/serviceRequestApi.js'

defineOptions({ name: 'DestinationLookupDialog' })

const props = defineProps({
  visible: { type: Boolean, default: false },
  // The member's home coordinates, `{ latitude, longitude }` or null. Centres
  // the search's bias circle so results are ranked near the member rather than
  // near a fixed statewide point. Null until the geocode returns, or forever if
  // it fails — the search then asks for the statewide circle.
  memberCoords: { type: Object, default: null },
  // Whether those coordinates are coming, usable, or never arriving:
  // 'idle' | 'pending' | 'ok' | 'failed'. 'pending' is treated as usable: the
  // geocode nearly always succeeds and it is fired on member-select, well
  // before anyone opens this dialog.
  memberCoordsStatus: { type: String, default: 'idle' },
  // What the dialog is filling — "Destination" or "Starting Location". Used
  // for the header and the input label so a coordinator can see which leg
  // they are looking up.
  legLabel: { type: String, default: 'Destination' }
})

const emit = defineEmits(['update:visible', 'select'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const text = ref('')
// null until a search has run, so the results area stays hidden on open.
const places = ref(null)
const elapsedMs = ref(0)
const isSearching = ref(false)

// The search is centred on the member's home, falling back to a statewide
// circle when their address cannot be geocoded. This was briefly a droplist,
// along with a town/state checkbox and a result-count field; the working group
// asked for all three to go and the defaults to become the only behaviour.
//
// 'failed' is the only status that cannot yield coordinates. 'pending' is
// optimistic on purpose — the geocode is fired on member-select, so it has
// almost always landed by the time this dialog opens, and the fallback below
// covers the rare case where it has not.
const canCentreOnMember = computed(() => props.memberCoordsStatus !== 'failed')

// Opens blank every time. The field being filled is usually already populated
// — Starting Location auto-fills with "Member's Home", and edit mode carries a
// saved destination — so seeding the box from it would mean clearing text
// nobody wants to search for, and would invite an accidental overwrite of a
// good address.
watch(() => props.visible, (isVisible) => {
  if (isVisible) {
    text.value = ''
    places.value = null
  }
}, { immediate: true })

async function find () {
  const q = text.value.trim()
  if (!q || isSearching.value) return
  isSearching.value = true
  const started = performance.now()
  try {
    // The member's town and state are deliberately NOT appended to the query
    // text. They were, behind an opt-in checkbox, because a bare town name
    // resolves lexically and "Hopkinton" means Massachusetts to Google — but
    // the checkbox is gone and its default was off. A coordinator who needs
    // that narrowing types the town themselves.
    const body = { text: q }
    const { latitude, longitude } = props.memberCoords ?? {}
    const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude)
    if (canCentreOnMember.value && hasCoords) {
      body.bias = 'member'
      body.latitude = latitude
      body.longitude = longitude
    }
    else {
      // No usable coordinates: ask for the statewide circle explicitly rather
      // than letting the bias default through with nothing to centre on.
      body.bias = 'statewide'
    }
    // maxResults is deliberately omitted: the API's own default is the same 20
    // the removed control defaulted to, so the request stays clean.
    const res = await searchPlaces(body)
    places.value = Array.isArray(res?.places) ? res.places : []
  } catch {
    places.value = []
  } finally {
    elapsedMs.value = Math.round(performance.now() - started)
    isSearching.value = false
  }
}

function choose (place) {
  emit('select', place)
  dialogVisible.value = false
}

const summary = computed(() => {
  if (!places.value) return ''
  const n = places.value.length
  return `${n} ${n === 1 ? 'match' : 'matches'} · ${elapsedMs.value} ms`
})
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    :header="`Look up ${legLabel.toLowerCase()}`"
    :style="{ width: '40rem' }"
    :breakpoints="{ '640px': '95vw' }"
  >
    <form class="lookup-form" @submit.prevent="find">
      <label for="destination-lookup-text" class="lookup-label">{{ legLabel }}</label>
      <div class="lookup-row">
        <InputText
          id="destination-lookup-text"
          v-model="text"
          autofocus
          placeholder="Name of a business, practice, or place"
          class="lookup-input"
        />
        <Button type="submit" label="Find matches" :loading="isSearching" :disabled="!text.trim()" />
      </div>
    </form>

    <div v-if="places" class="lookup-results">
      <p class="lookup-summary">{{ summary }}</p>
      <p v-if="!places.length" class="lookup-empty">
        No matches. Try adding the town, or enter the address by hand.
      </p>
      <ul v-else class="result-list">
        <li v-for="p in places" :key="p.placeId">
          <button type="button" class="result" @click="choose(p)">
            <span class="result-name">{{ p.name }}</span>
            <span class="result-addr">{{ p.formattedAddress }}</span>
          </button>
        </li>
      </ul>
    </div>
  </Dialog>
</template>

<style scoped>
.lookup-form { display: flex; flex-direction: column; gap: 0.5rem; }
.lookup-label { font-weight: 500; }
.lookup-row { display: flex; gap: 0.5rem; }
.lookup-input { flex: 1; min-width: 0; }

.lookup-results { margin-top: 1.25rem; }
.lookup-summary {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
}
.lookup-empty { margin: 0; color: var(--p-text-muted-color); }

/* Scroll the results, not the whole dialog. PrimeVue caps the dialog at 90%
   of the viewport and scrolls .p-dialog-content, which would carry the search
   box off-screen with it. Capping the list keeps the input and Find matches
   button in view on a short window or a projector. */
.result-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: min(24rem, 45vh);
  overflow-y: auto;
}
.result {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  padding: 0.6rem 0.8rem;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-md, 6px);
  cursor: pointer;
}
.result:hover,
.result:focus-visible {
  border-color: var(--p-primary-color);
  outline: none;
  background: var(--p-highlight-background);
}
.result-name { font-weight: 600; }
.result-addr { font-size: 0.9rem; color: var(--p-text-muted-color); }
</style>
