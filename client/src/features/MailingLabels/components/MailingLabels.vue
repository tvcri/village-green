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
// the API enum. Monthly runs are the common case, so the full-roster sweep
// sits last; "Full roster" is its display word (the API value stays roster).
const AUDIENCE_OPTIONS = [
  { label: 'Printed newsletter', value: 'printed-newsletter' },
  { label: 'Birthday month', value: 'birthday-month' },
  { label: 'Join month', value: 'join-month' },
  { label: 'Full roster', value: 'roster' },
]
// printed-newsletter and join-month are member-table-backed: the role locks
// to member and the Role select is hidden (no choice to make). birthday-month
// is person-level and open to every role.
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

// No default audience: the page renders nothing and fires no request until
// the user expresses intent. The old roster default ran the heaviest query
// (full roster + PDF build) on every visit, when the common use is a small
// monthly run.
const audience = ref(null)
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
// What the request may send, derived from what the user selected: a hidden
// Role/Month select never contributes its value, and the user's selection is
// never overwritten — detour through join-month and back, and a chosen
// "Volunteers" or month is still there.
const effectiveRole = computed(() => (isMemberOnly.value ? 'member' : role.value))
const effectiveMonth = computed(() => (isMonthAudience.value ? month.value : null))
// No audience, or a month audience with no month chosen, is an incomplete
// configuration: no request fires and the stale preview is cleared rather
// than left misleading.
const configComplete = computed(() =>
  audience.value !== null && (!isMonthAudience.value || month.value !== null))

const { state: villages, execute: loadVillages } = useAsyncState(
  () => getVillages(),
  { immediate: false, initialState: [] }
)
// PrimeVue Select renders a null model as "no selection" (empty label), so a
// null-valued option can never display as chosen. The select binds to a
// sentinel and maps it to villageId's semantic null (= no filter), which the
// watcher, request, and title all key on.
const ALL_VILLAGES = 'all'
const villageOptions = computed(() => [
  { label: 'All villages', value: ALL_VILLAGES },
  // The API orders by name (VillageService hardcodes ORDER BY v.name);
  // re-sorting here could disagree with MySQL collation.
  ...villages.value.map(v => ({ label: v.name, value: v.villageId })),
])
const villageSelection = computed({
  get: () => villageId.value ?? ALL_VILLAGES,
  set: (value) => { villageId.value = value === ALL_VILLAGES ? null : value },
})
const selectedVillageName = computed(() =>
  villages.value.find(v => v.villageId === villageId.value)?.name ?? null)

const { state: labelData, isLoading, error: labelsError, execute: loadLabels } = useAsyncState(
  () => getMailingLabels({
    audience: audience.value,
    role: effectiveRole.value,
    villageId: villageId.value,
    month: effectiveMonth.value,
  }),
  { immediate: false }
)

const labels = computed(() => labelData.value?.labels ?? [])
const summary = computed(() => labelData.value?.summary ?? null)
const unmailable = computed(() => labelData.value?.warnings?.unmailable ?? [])

// "Category - Qualifier" heading composed from the configuration, audience
// first — the format the old hand-curated registry labels already used.
const composedTitle = computed(() => {
  // Only evaluated once labels exist, which implies an audience — the guard
  // is insurance against a future caller reading it in the null state.
  const audienceOption = AUDIENCE_OPTIONS.find(o => o.value === audience.value)
  if (!audienceOption) return ''
  let head = audienceOption.label
  if (effectiveMonth.value !== null) {
    head += `: ${MONTH_OPTIONS.find(m => m.value === effectiveMonth.value).label}`
  }
  const parts = [head]
  if (!isMemberOnly.value) parts.push(ROLE_TITLE[effectiveRole.value])
  if (villageId.value !== null && selectedVillageName.value) parts.push(selectedVillageName.value)
  return parts.join(' - ')
})

// First entry into a month audience seeds Month with next month — monthly
// mailings are prepared ahead of their month. getMonth() is 0-based, so +1
// is the current 1-based month and the %12+1 wraps December to January. A
// change handler rather than watcher normalization: the seed is a one-time
// convenience on a user action, so a nulled month stays representable and
// nothing ever overwrites a value the user can see.
function onAudienceSelected () {
  if (isMonthAudience.value && month.value === null) {
    month.value = (new Date().getMonth() + 1) % 12 + 1
  }
}

// One watcher, one straight-line pass: every change either fires exactly one
// request or clears the result. The effective* computeds make hidden-but-set
// state unsendable, so no 422 combination can be requested. Clearing
// labelData is sufficient cleanup — it empties sortedLabels, and the
// regenerate watcher owns revoking the preview URL.
watch([audience, effectiveRole, villageId, effectiveMonth], async () => {
  truncated.value = []
  if (!configComplete.value) {
    labelData.value = null
    return
  }
  // useAsyncState keeps the previous state on failure. A failed reload must
  // not leave the prior run's PDF under the new control values — the user
  // would print the wrong labels. (Aborts and lost races also resolve null,
  // but they leave labelsError unset and a newer pass owns the state.)
  if (await loadLabels() === null && labelsError.value) {
    labelData.value = null
  }
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
  // A PDF build still in flight must lose the generation race, or it would
  // mint a fresh object URL after this revoke that nothing ever revokes.
  generation++
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

onMounted(() => {
  loadVillages()
  // No audience is selected yet, so there is nothing to load: the watcher
  // fires the first request when the configuration becomes complete.
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
            placeholder="Choose an audience"
            @change="onAudienceSelected"
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

        <div v-if="audience !== null && !isMemberOnly" class="field">
          <label for="role">Role</label>
          <Select
            id="role"
            v-model="role"
            :options="ROLE_OPTIONS"
            option-label="label"
            option-value="value"
          />
        </div>

        <div v-if="audience !== null" class="field">
          <label for="village">Village</label>
          <Select
            id="village"
            v-model="villageSelection"
            :options="villageOptions"
            option-label="label"
            option-value="value"
          />
        </div>

        <p v-if="!configComplete" class="note">
          {{ audience === null ? 'Choose an audience to generate labels.' : 'Choose a month to generate labels.' }}
        </p>

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
        <li v-for="(u, i) in unmailable" :key="i">{{ u.name }} — {{ u.reason }}</li>
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
