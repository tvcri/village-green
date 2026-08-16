<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Popover from 'primevue/popover'
import Select from 'primevue/select'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getMailingLabels } from '../api/mailingLabelApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { generateLabelPdf } from '../lib/generateLabelPdf.js'

// The audience is the population definition — the kind of mailing. Values are
// the API enum; "All labels" is the display word for roster (a one-string
// decision — the API value stays roster regardless).
const AUDIENCE_OPTIONS = [
  { label: 'All labels', value: 'roster' },
  { label: 'Printed newsletter', value: 'printed-newsletter' },
  { label: 'Birthday month', value: 'birthday-month' },
  { label: 'Join month', value: 'join-month' },
]
// printed-newsletter and join-month are member-table-backed: the role locks
// to member. birthday-month is person-level and open to every role.
const MEMBER_ONLY_AUDIENCES = new Set(['printed-newsletter', 'join-month'])
const MONTH_AUDIENCES = new Set(['birthday-month', 'join-month'])

const ROLE_OPTIONS = [
  { label: 'Active members', value: 'member' },
  { label: 'Active volunteers', value: 'volunteer' },
  { label: 'Either', value: 'either' },
]
// In headings, 'either' reads as the pair; the Select option stays "Either".
const ROLE_TITLE = {
  member: 'Active members',
  volunteer: 'Active volunteers',
  either: 'Active members & volunteers',
}

const MONTH_OPTIONS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
].map((label, i) => ({ label, value: i + 1 }))

// Defaults produce a complete configuration, so the first paint shows a live
// preview immediately (matching the old preselect-and-render behavior).
const audience = ref('roster')
const role = ref('member')
const villageId = ref(null)
const month = ref(null)

const startPosition = ref(1)
const nudgeX = ref(0)
const nudgeY = ref(0)
const sortBy = ref('zip')
const truncated = ref([])
const previewUrl = ref(null)

// Template refs for the ribbon's print-settings popover and the two
// warning-detail popovers (opened from the one-line summaries in the column).
const settingsPop = ref(null)
const unmailablePop = ref(null)
const truncatedPop = ref(null)

const sortOptions = [
  { label: 'By Zip', value: 'zip' },
  { label: 'By Last Name', value: 'lastName' },
  { label: 'By City', value: 'city' },
]

const isMemberOnly = computed(() => MEMBER_ONLY_AUDIENCES.has(audience.value))
const isMonthAudience = computed(() => MONTH_AUDIENCES.has(audience.value))
// A month audience with no month chosen is an incomplete configuration: no
// request fires and the stale preview is cleared rather than left misleading.
const configComplete = computed(() => !isMonthAudience.value || month.value !== null)

const { state: villages, execute: loadVillages } = useAsyncState(
  () => getVillages(),
  { immediate: false, initialState: [] }
)
const villageOptions = computed(() => [
  { label: 'All villages', value: null },
  ...[...villages.value].sort((a, b) => a.name.localeCompare(b.name))
    .map(v => ({ label: v.name, value: v.villageId })),
])
const selectedVillageName = computed(() =>
  villages.value.find(v => v.villageId === villageId.value)?.name ?? null)

const { state: labelData, isLoading, execute: loadLabels } = useAsyncState(
  () => getMailingLabels({
    audience: audience.value,
    role: role.value,
    villageId: villageId.value,
    month: month.value,
  }),
  { immediate: false }
)

const labels = computed(() => labelData.value?.labels ?? [])
const summary = computed(() => labelData.value?.summary ?? null)
const unmailable = computed(() => labelData.value?.warnings?.unmailable ?? [])

// "Category - Qualifier" heading composed from the configuration, audience
// first — the format the old hand-curated registry labels already used.
const composedTitle = computed(() => {
  let head = AUDIENCE_OPTIONS.find(o => o.value === audience.value).label
  if (isMonthAudience.value && month.value !== null) {
    head += `: ${MONTH_OPTIONS.find(m => m.value === month.value).label}`
  }
  const parts = [head]
  if (!isMemberOnly.value) parts.push(ROLE_TITLE[role.value])
  if (villageId.value !== null && selectedVillageName.value) parts.push(selectedVillageName.value)
  return parts.join(' - ')
})

// One watcher: normalize dependent state first, then fire or clear. A
// normalization write re-triggers this watcher (the early return prevents a
// request with intermediate state); normalization is idempotent, so it
// settles within a bounded number of extra passes (at most one per
// normalization branch above). The request therefore always mirrors the
// visible controls — hidden-but-set state can never produce a 422.
watch([audience, role, villageId, month], () => {
  if (isMemberOnly.value && role.value !== 'member') {
    role.value = 'member'
    return
  }
  if (!isMonthAudience.value && month.value !== null) {
    month.value = null
    return
  }
  truncated.value = []
  if (!configComplete.value) {
    labelData.value = null
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value)
      previewUrl.value = null
    }
    return
  }
  loadLabels()
})

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
  const gen = ++generation
  if (!sortedLabels.value.length) {
    truncated.value = []
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value)
      previewUrl.value = null
    }
    return
  }
  const result = await generateLabelPdf(sortedLabels.value, {
    startPosition: startPosition.value,
    nudgeX: nudgeX.value,
    nudgeY: nudgeY.value,
    title: composedTitle.value,
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

onMounted(() => {
  loadVillages()
  // The defaults are a complete configuration; render labels immediately.
  loadLabels()
})
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
            v-model="audience"
            :options="AUDIENCE_OPTIONS"
            option-label="label"
            option-value="value"
          />
        </div>

        <div class="field">
          <label for="role">Role</label>
          <Select
            id="role"
            v-model="role"
            :options="ROLE_OPTIONS"
            option-label="label"
            option-value="value"
            :disabled="isMemberOnly"
          />
        </div>

        <div class="field">
          <label for="village">Village</label>
          <Select
            id="village"
            v-model="villageId"
            :options="villageOptions"
            option-label="label"
            option-value="value"
          />
        </div>

        <div v-if="isMonthAudience" class="field">
          <label for="month">Month</label>
          <Select
            id="month"
            v-model="month"
            :options="MONTH_OPTIONS"
            option-label="label"
            option-value="value"
            placeholder="Choose a month"
          />
        </div>

        <p v-if="!configComplete" class="note">Choose a month to generate labels.</p>

        <div v-if="isLoading">Loading…</div>

        <template v-else-if="summary">
          <p>
            <strong>{{ summary.labelCount }}</strong> labels
            ({{ summary.recipientCount }} recipients, {{ summary.mergedCount }} merged)
          </p>

          <button
            v-if="unmailable.length"
            type="button"
            class="warning-toggle"
            @click="unmailablePop.toggle($event)"
          >
            {{ unmailable.length }} recipients have no street address and are not included
          </button>

          <button
            v-if="truncated.length"
            type="button"
            class="warning-toggle"
            @click="truncatedPop.toggle($event)"
          >
            {{ truncated.length }} labels had text too long to fit and were shortened
          </button>
        </template>
      </div>

      <div class="preview-pane">
        <div class="ribbon">
          <label for="sortBy">Sort labels</label>
          <Select
            id="sortBy"
            v-model="sortBy"
            :options="sortOptions"
            option-label="label"
            option-value="value"
            :disabled="!summary"
            size="small"
            class="sort-select"
          />
          <span class="note ribbon-note">
            Print from the preview at 100% scale ("Actual size") with
            "fit to page" turned off.
          </span>
          <Button
            icon="pi pi-cog"
            severity="secondary"
            text
            size="small"
            aria-label="Print settings"
            :disabled="!summary"
            @click="settingsPop.toggle($event)"
          />
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

    <Popover ref="settingsPop">
      <div class="settings-fields">
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
      </div>
    </Popover>

    <Popover ref="unmailablePop">
      <ul class="warning-list">
        <li v-for="u in unmailable" :key="u.name">{{ u.name }} — {{ u.reason }}</li>
      </ul>
    </Popover>

    <Popover ref="truncatedPop">
      <ul class="warning-list">
        <li v-for="(t, i) in truncated" :key="i">
          <strong>{{ t.name }}</strong><br>
          prints as "{{ t.printed }}"<template v-if="t.line !== t.name"> (was "{{ t.line }}")</template>
        </li>
      </ul>
    </Popover>
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
  /* Content is bounded now (warnings collapse to one-line toggles), so this
     never engages in normal use — it's a safety net for tiny windows. */
  overflow-y: auto;
  min-height: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.preview-pane {
  flex: 1;
  min-width: 0;
  /* min-height:0 lets the pane fill AND shrink with the window now that the
     parent has a definite height. A fixed min-height would reintroduce the
     non-responsive floor we just removed. */
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  /* Clip the iframe's square corners to the pane's radius. */
  overflow: hidden;
}

.ribbon {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.25rem 0.75rem;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.ribbon label {
  font-size: 0.875rem;
  color: var(--color-text-primary);
  white-space: nowrap;
}

.sort-select {
  width: 10rem;
  flex-shrink: 0;
}

.ribbon-note {
  margin-left: auto;
  text-align: right;
}

.preview {
  flex: 1;
  min-height: 0;
  border: none;
}

.preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-dim);
}

.note {
  font-size: 0.875rem;
  color: var(--color-text-dim);
}

.warning-toggle {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  color: var(--color-text-error);
  text-decoration: underline dotted;
  cursor: pointer;
}

.settings-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 15rem;
}

.warning-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.875rem;
  max-width: 24rem;
  /* Long lists scroll inside the popover rather than growing past the viewport. */
  max-height: 50vh;
  overflow-y: auto;
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
