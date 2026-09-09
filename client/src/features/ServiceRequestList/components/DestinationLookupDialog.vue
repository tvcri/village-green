<script setup>
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import { searchPlaces } from '../api/serviceRequestApi.js'

defineOptions({ name: 'DestinationLookupDialog' })

const props = defineProps({
  visible: { type: Boolean, default: false },
  // The member's town and state. Sent with the search so "CVS" finds the
  // Barrington CVS rather than eight of them — the coordinator types the
  // name, Village Green supplies the rest. The state is load-bearing: a bare
  // "Hopkinton" resolves to Massachusetts.
  town: { type: String, default: '' },
  state: { type: String, default: '' },
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
// Whether to narrow the search to the member's town. Off by default and reset
// on every open: the member's town is right for a local errand and wrong for an
// appointment across the state, and the coordinator is the one who knows which.
const useMemberTown = ref(false)
// DEMO-ONLY. A knob for the working group to vary the result count live while
// we learn what a useful list looks like. Google's ceiling is 20. Remove this,
// the input, and the API's `maxResults` field together once the count settles.
const DEFAULT_MAX_RESULTS = 20
const maxResults = ref(DEFAULT_MAX_RESULTS)
// null until a search has run, so the results area stays hidden on open.
const places = ref(null)
const elapsedMs = ref(0)
const isSearching = ref(false)

// Opens blank every time. The field being filled is usually already populated
// — Starting Location auto-fills with "Member's Home", and edit mode carries a
// saved destination — so seeding the box from it would mean clearing text
// nobody wants to search for, and would invite an accidental overwrite of a
// good address.
watch(() => props.visible, (isVisible) => {
  if (isVisible) {
    text.value = ''
    useMemberTown.value = false
    maxResults.value = DEFAULT_MAX_RESULTS
    places.value = null
  }
}, { immediate: true })

async function find () {
  const q = text.value.trim()
  if (!q || isSearching.value) return
  isSearching.value = true
  const started = performance.now()
  try {
    const body = useMemberTown.value && props.town
      ? { text: q, town: props.town, state: props.state }
      : { text: q }
    // DEMO-ONLY: only sent when moved off the default, so the request stays
    // clean once this control is removed.
    const n = Number(maxResults.value)
    if (Number.isFinite(n) && n !== DEFAULT_MAX_RESULTS) {
      body.maxResults = Math.min(Math.max(Math.floor(n), 1), 20)
    }
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

// Shown so a coordinator can see why "CVS" came back as the Wyoming store —
// and, when a member's address is stale, why the results look off. Town and
// state together, because the state is what disambiguates "Hopkinton".
const nearText = computed(() =>
  props.town ? [props.town, props.state].filter(Boolean).join(', ') : ''
)

// Closes the list. The list scrolls, so its tail is off-screen — this says how
// many there are without the coordinator scrolling to find the end.
const countText = computed(() => {
  const n = places.value?.length ?? 0
  return `${n} ${n === 1 ? 'result' : 'results'}`
})

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
      <div class="lookup-opts">
        <div v-if="nearText" class="lookup-near">
          <Checkbox v-model="useMemberTown" input-id="lookup-near" binary />
          <label for="lookup-near">Search near {{ nearText }}</label>
        </div>
        <!-- DEMO-ONLY control; remove with the API's maxResults field. -->
        <div class="lookup-count">
          <label for="lookup-max">Max results</label>
          <input id="lookup-max" v-model.number="maxResults" type="number" min="1" max="20" />
        </div>
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
      <p v-if="places.length" class="result-count">{{ countText }}</p>
    </div>
  </Dialog>
</template>

<style scoped>
.lookup-form { display: flex; flex-direction: column; gap: 0.5rem; }
.lookup-label { font-weight: 500; }
.lookup-row { display: flex; gap: 0.5rem; }
.lookup-input { flex: 1; min-width: 0; }
.lookup-opts { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.lookup-near { display: flex; align-items: center; gap: 0.5rem; }
.lookup-near label { color: var(--p-text-muted-color); cursor: pointer; }

/* DEMO-ONLY control. Deliberately understated — it is an experiment knob,
   not part of the coordinator's workflow. Remove with the maxResults field. */
.lookup-count { display: flex; align-items: center; gap: 0.4rem; margin-left: auto; }
.lookup-count label { color: var(--p-text-muted-color); font-size: 0.85rem; }
.lookup-count input {
  width: 3.6rem; padding: 0.2rem 0.4rem; font: inherit; font-size: 0.85rem;
  color: var(--p-text-color);
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-sm, 4px);
}

.lookup-results { margin-top: 1.25rem; }
.lookup-summary {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
}
.lookup-empty { margin: 0; color: var(--p-text-muted-color); }
.result-count {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
}

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
