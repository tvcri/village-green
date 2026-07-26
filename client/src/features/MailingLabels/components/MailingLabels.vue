<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getMailingLabelAudiences, getMailingLabels } from '../api/mailingLabelApi.js'
import { generateLabelPdf } from '../lib/generateLabelPdf.js'

const selectedAudience = ref(null)
const startPosition = ref(1)
const nudgeX = ref(0)
const nudgeY = ref(0)
const sortBy = ref('zip')
const truncated = ref([])
const previewUrl = ref(null)

const sortOptions = [
  { label: 'By Zip', value: 'zip' },
  { label: 'By Last Name', value: 'lastName' },
  { label: 'By City', value: 'city' },
]

const { state: audiences, execute: loadAudiences } = useAsyncState(
  () => getMailingLabelAudiences(),
  { immediate: false, initialState: [] }
)

const { state: labelData, isLoading, execute: loadLabels } = useAsyncState(
  () => getMailingLabels(selectedAudience.value),
  { immediate: false }
)

const labels = computed(() => labelData.value?.labels ?? [])
const summary = computed(() => labelData.value?.summary ?? null)
const unmailable = computed(() => labelData.value?.warnings?.unmailable ?? [])

// Order the labels by the user's chosen key. The API returns them zip-then-name,
// so 'zip' is a stable passthrough; 'lastName' and 'city' re-key using the
// primary recipient's real last name (sortLastName) rather than parsing the
// composed display name. Each comparator falls through to a stable tiebreak so
// the order is deterministic. cmp() is locale-aware and null-safe.
const cmp = (a, b) => String(a ?? '').localeCompare(String(b ?? ''))
const sortComparators = {
  zip: (a, b) => cmp(a.zip, b.zip) || cmp(a.sortLastName, b.sortLastName) || cmp(a.name, b.name),
  lastName: (a, b) => cmp(a.sortLastName, b.sortLastName) || cmp(a.name, b.name),
  city: (a, b) => cmp(a.city, b.city) || cmp(a.sortLastName, b.sortLastName) || cmp(a.name, b.name),
}
const sortedLabels = computed(() => {
  const compare = sortComparators[sortBy.value] ?? sortComparators.zip
  return [...labels.value].sort(compare)
})

// Regenerate the preview whenever the sorted labels or any print option change.
// Generation is milliseconds for text-only labels, so no debounce and no
// Generate button. The generation counter makes a stale async build lose to
// a newer one; revoking the prior object URL keeps blobs from accumulating.
let generation = 0
async function regenerate () {
  if (!sortedLabels.value.length) return
  const gen = ++generation
  const result = await generateLabelPdf(sortedLabels.value, {
    startPosition: startPosition.value,
    nudgeX: nudgeX.value,
    nudgeY: nudgeY.value,
  })
  if (gen !== generation) return
  truncated.value = result.truncated
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(result.blob)
}

watch([sortedLabels, startPosition, nudgeX, nudgeY], regenerate)

onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

onMounted(async () => {
  const result = await loadAudiences()
  // Single audience: preselect and load. The Select still renders — more
  // audiences are expected and the UI should not change shape when they land.
  if (result?.length === 1) {
    selectedAudience.value = result[0].id
    loadLabels()
  }
})

function onAudienceChange () {
  truncated.value = []
  loadLabels()
}
</script>

<template>
  <div class="mailing-labels">
    <h1>Mailing Labels</h1>

    <div class="layout">
      <div class="controls">
        <div class="field">
          <label for="audience">Audience</label>
          <Select
            id="audience"
            v-model="selectedAudience"
            :options="audiences"
            option-label="label"
            option-value="id"
            placeholder="Choose a list"
            @change="onAudienceChange"
          />
        </div>

        <div v-if="isLoading">Loading…</div>

        <template v-else-if="summary">
          <p>
            <strong>{{ summary.labelCount }}</strong> labels
            ({{ summary.recipientCount }} recipients, {{ summary.mergedCount }} merged)
          </p>

          <div v-if="unmailable.length" class="warning">
            <p>{{ unmailable.length }} recipients have no street address and are not included:</p>
            <ul>
              <li v-for="u in unmailable" :key="u.name">{{ u.name }} — {{ u.reason }}</li>
            </ul>
          </div>

          <div class="field">
            <label for="sortBy">Sort labels</label>
            <Select
              id="sortBy"
              v-model="sortBy"
              :options="sortOptions"
              option-label="label"
              option-value="value"
            />
          </div>

          <div class="field">
            <label for="start">Start at label position</label>
            <InputNumber id="start" v-model="startPosition" :min="1" :max="30" show-buttons />
          </div>

          <div class="field">
            <label for="nudgeX">Nudge right (points)</label>
            <InputNumber id="nudgeX" v-model="nudgeX" :min="-36" :max="36" show-buttons />
          </div>
          <div class="field">
            <label for="nudgeY">Nudge down (points)</label>
            <InputNumber id="nudgeY" v-model="nudgeY" :min="-36" :max="36" show-buttons />
          </div>

          <p class="note">
            Print from the preview at 100% scale ("Actual size") with
            "fit to page" turned off.
          </p>

          <div v-if="truncated.length" class="warning">
            <p>{{ truncated.length }} labels had text too long to fit and were shortened:</p>
            <ul>
              <li v-for="(t, i) in truncated" :key="i">{{ t.name }} — "{{ t.line }}"</li>
            </ul>
          </div>
        </template>
      </div>

      <iframe
        v-if="previewUrl"
        :src="previewUrl"
        class="preview"
        title="Mailing label PDF preview"
      />
      <div v-else class="preview preview-empty">
        <p>The PDF preview appears here.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mailing-labels {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  /* The app shell is a document-scroll layout (min-height:100dvh), so an
     ancestor never hands this page a definite height for `height:100%` to
     resolve against — it would collapse and the iframe would fall back to its
     min-height. Size against the viewport directly instead, subtracting the
     in-flow chrome above .app-main: header (70px) + breadcrumbs
     (~43px: 1rem+0.5rem padding + ~1.2rem content). The banner is
     position:absolute and takes no layout space. This keeps the fix local to
     this page — App.vue's shared layout (and every other page's scroll
     behavior) is untouched. */
  height: calc(100dvh - 113px);
  box-sizing: border-box;
}

h1 {
  margin: 0;
  color: var(--color-text-primary);
}

.layout {
  display: flex;
  gap: 1.5rem;
  flex: 1;
  min-height: 0;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 18rem;
  flex-shrink: 0;
  /* The truncated/unmailable warning lists can be long; scroll the controls
     column internally rather than letting it grow the fixed-height layout. */
  overflow-y: auto;
  min-height: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.preview {
  flex: 1;
  min-width: 0;
  /* min-height:0 lets the iframe fill AND shrink with the window now that the
     parent has a definite height. A fixed min-height would reintroduce the
     non-responsive floor we just removed. */
  min-height: 0;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 4px;
}

.preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary, #6b7280);
}

.note {
  font-size: 0.875rem;
  color: var(--color-text-secondary, #6b7280);
}

.warning ul {
  margin: 0.25rem 0 0;
  padding-left: 1.25rem;
}

/* Match App.vue's 768px breakpoint: header shrinks 70px->60px and the
   breadcrumb padding tightens, so the chrome above .app-main is ~99px. */
@media (max-width: 768px) {
  .mailing-labels {
    height: calc(100dvh - 99px);
    padding: 1rem;
  }
}
</style>
