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
    places.value = null
  }
}, { immediate: true })

async function find () {
  const q = text.value.trim()
  if (!q || isSearching.value) return
  isSearching.value = true
  const started = performance.now()
  try {
    const res = await searchPlaces(
      useMemberTown.value && props.town
        ? { text: q, town: props.town, state: props.state }
        : { text: q }
    )
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
      <div v-if="nearText" class="lookup-near">
        <Checkbox v-model="useMemberTown" input-id="lookup-near" binary />
        <label for="lookup-near">Search near {{ nearText }}</label>
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
.lookup-near { display: flex; align-items: center; gap: 0.5rem; }
.lookup-near label { color: var(--p-text-muted-color); cursor: pointer; }

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
