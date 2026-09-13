<script setup>
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
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
  // The member's home coordinates, `{ latitude, longitude }` or null. Centres
  // the search's bias circle so results are ranked near the member rather than
  // near a fixed statewide point. Null until the geocode returns, or forever if
  // it fails — the API then uses the statewide circle.
  memberCoords: { type: Object, default: null },
  // Whether those coordinates are coming, usable, or never arriving:
  // 'idle' | 'pending' | 'ok' | 'failed'. Drives whether "Near the member" can
  // be chosen at all. 'pending' counts as selectable — see BIAS_OPTIONS.
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
// Whether to narrow the search to the member's town. Off by default and reset
// on every open: the member's town is right for a local errand and wrong for an
// appointment across the state, and the coordinator is the one who knows which.
const useMemberTown = ref(false)

// Which geographic bias circle to ask for. Separate mechanism from the town
// checkbox above, and deliberately so: the checkbox edits the query TEXT,
// which is strong evidence to Google and can fence results into a town; this
// is a ranking nudge, which excludes nothing outside the circle. The customer
// asked about exactly this distinction — do not conflate them.
//
// "No bias" is labelled dev-only for a reason that is invisible here. Google's
// fallback when no bias is sent is the CALLER's IP, and in production that is
// an Azure App Service address in northern Virginia. The playground makes it
// look harmless only because this machine egresses from Rhode Island.
const DEFAULT_BIAS = 'member'
const bias = ref(DEFAULT_BIAS)

// Whether the member can actually be the centre. 'pending' counts as yes: the
// geocode nearly always succeeds, and flickering the option disabled for the
// fraction of a second it is outstanding is worse than the narrow window in
// which a search fired right now falls back to statewide.
const canCentreOnMember = computed(() => props.memberCoordsStatus !== 'failed')

// Built from the status, so the droplist never offers a centre it cannot
// honour. "Near the member" stays in the list when it is unavailable — the
// list keeps a stable length, and a disabled row with a reason tells the
// coordinator the member's address is bad, which an option that had silently
// vanished would not.
const BIAS_OPTIONS = computed(() => [
  {
    label: 'Near the member',
    value: 'member',
    disabled: !canCentreOnMember.value,
    // Rendered under the label in the dropdown, not in the closed control, so
    // the reason is visible where the choice is made without widening the box.
    note: canCentreOnMember.value ? '' : "member's address not located"
  },
  { label: 'Statewide', value: 'statewide' },
  { label: 'No bias (dev only)', value: 'none' }
])

// Every label, for the width sizer. Static: the option labels themselves never
// change, so the control keeps one width for the life of the dialog.
const BIAS_SIZER_LABELS = ['Near the member', 'Statewide', 'No bias (dev only)']

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
    // Statewide when the member cannot be the centre, so the dialog never
    // opens on a disabled option.
    bias.value = canCentreOnMember.value ? DEFAULT_BIAS : 'statewide'
    maxResults.value = DEFAULT_MAX_RESULTS
    places.value = null
  }
}, { immediate: true })

// A geocode can fail while the dialog is already open — it is fired on
// member-select and the coordinator may well have got here first. Move the
// selection off "Near the member" when that happens, rather than leaving a
// disabled option selected and searching something other than what it says.
watch(canCentreOnMember, (canCentre) => {
  if (!canCentre && bias.value === 'member') bias.value = 'statewide'
})

async function find () {
  const q = text.value.trim()
  if (!q || isSearching.value) return
  isSearching.value = true
  const started = performance.now()
  try {
    const body = useMemberTown.value && props.town
      ? { text: q, town: props.town, state: props.state }
      : { text: q }
    body.bias = bias.value
    // Only sent for the member-centred mode, and only when the geocode
    // actually returned. Without them the API falls back to statewide, which
    // is what we want for a member whose address does not resolve.
    if (bias.value === 'member' && props.memberCoords) {
      const { latitude, longitude } = props.memberCoords
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        body.latitude = latitude
        body.longitude = longitude
      }
    }
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
        <div class="lookup-bias">
          <label for="lookup-bias">Rank results</label>
          <!-- The Select is sized by the widest option, not by the selected
               one, so choosing a shorter label cannot shrink it. The sizer
               below is laid out (so it sets the grid column's width) but
               painted transparent and hidden from assistive tech; the real
               Select is stacked on top of it. -->
          <div class="bias-select">
            <span class="bias-sizer" aria-hidden="true">
              <span v-for="label in BIAS_SIZER_LABELS" :key="label">{{ label }}</span>
            </span>
            <Select
              input-id="lookup-bias"
              v-model="bias"
              :options="BIAS_OPTIONS"
              option-label="label"
              option-value="value"
              option-disabled="disabled"
              size="small"
            >
              <template #option="{ option }">
                <div class="bias-option">
                  <span>{{ option.label }}</span>
                  <!-- Why the option cannot be picked, shown at the point of
                       choosing rather than as a hint elsewhere in the form. -->
                  <small v-if="option.note">{{ option.note }}</small>
                </div>
              </template>
            </Select>
          </div>
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

.lookup-bias { display: flex; align-items: center; gap: 0.5rem; }
.lookup-bias label { color: var(--p-text-muted-color); }

/* A PrimeVue Select sizes itself to the SELECTED option's text, so picking a
   shorter one ("Statewide") shrinks the control and the whole options row
   re-wraps under it — the checkbox and Max results visibly jump between one
   line and two.

   Fix by stacking the Select on a hidden sizer holding every option label, in
   a 1x1 grid: the grid column is as wide as the widest label, so the control
   keeps that width whatever is selected. Measured rather than hardcoded, so a
   longer option or a different font size stays correct. */
.bias-select { display: grid; }
.bias-select > * { grid-area: 1 / 1; }
.bias-sizer {
  /* Laid out (it must set the column width) but invisible and untabbable.
     visibility:hidden, not display:none — the latter measures nothing. */
  visibility: hidden;
  height: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 0.875rem;
  /* Room for the Select's own horizontal padding and its dropdown chevron,
     which the sizer's bare text does not account for. Widening the sizer is
     what reserves the space — padding on .p-select would only move the
     chevron inward. */
  padding-right: 3rem;
}
/* The labels stack rather than sum: only the widest sets the column. */
.bias-sizer span { display: block; }
.bias-select :deep(.p-select) { width: 100%; }
.bias-select :deep(.p-select-label) { white-space: nowrap; }
/* The reason a bias option cannot be picked, shown inside the dropdown row. */
.bias-option { display: flex; flex-direction: column; line-height: 1.25; }
.bias-option small { font-size: 0.75rem; font-style: italic; opacity: 0.85; }

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
