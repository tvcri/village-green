# Notification History Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-row bell action on the Service Request list that opens a modal dialog showing that request's notification history (open/confirmed/cancelled/reminder events with sent/failed/pending status and recipients), fetched lazily per row on open.

**Architecture:** Client UI only — no backend or API-client changes (`getServiceRequest(id, ['notificationHistory'])` already exists). Three new files: a pure-JS helper module holding all testable logic (sort, status derivation, labeled timestamp, recipient formatting), a presentational `NotificationHistoryList.vue` that renders the helper output, and a container `NotificationHistoryDialog.vue` that owns fetch/loading/error/empty state. The list view (`ServiceRequestList.vue`) gains an Actions column visible in both modes with a bell button on every row.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), PrimeVue (`Dialog`, `Tag`, `Button`), the existing `useAsyncState` and `useStatusSeverity` composables, Vitest for pure-JS unit tests.

## Global Constraints

- **No backend or API-client changes.** Reuse `getServiceRequest(serviceRequestId, ['notificationHistory'])` from `client/src/features/ServiceRequestList/api/serviceRequestApi.js` exactly as-is.
- **Tests are pure-JS only** (Option B). This repo has no working `.vue` component test setup — `vite.config.js` has no `test` block and `src/testUtils/setupTests.js` is orphaned. Do NOT add component-test infrastructure. All automated tests target the pure helper module, written in the existing style: `import { describe, it, expect } from 'vitest'`.
- **Status derivation:** `sentAt` set → `'sent'`; `failedAt` set → `'failed'`; both null/absent → `'pending'`. `sentAt`/`failedAt` are mutually exclusive.
- **Sort** notification entries by `createdAt` descending (newest first), always on a copy (never mutate the prop).
- **Displayed timestamp** is the outcome timestamp with a label: sent → "Sent <ts>", failed → "Failed <ts>", pending → "Created <ts>".
- **Recipients** render as `fullName` values comma-joined; empty array → `'—'`. Show all (no truncation in v1).
- **Bell button** uses `@click.stop` so it never triggers the DataTable row-click navigation.
- Event-type display is capitalized first letter: `open` → "Open", `confirmed` → "Confirmed", etc.
- CSS uses the existing theme variables (`--color-text-primary`, `--color-text-dim`, `--color-border-default`, etc.) consistent with `ServiceRequestDetail.vue`.

---

### Task 1: Pure helper module for notification-history logic

All logic that can be wrong lives here and is unit-tested. The components in later tasks only render this module's output.

**Files:**
- Create: `client/src/features/ServiceRequestList/lib/notificationHistory.js`
- Test: `client/src/features/ServiceRequestList/lib/notificationHistory.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (consumed by Tasks 2):
  - `eventStatus(entry) -> 'sent' | 'failed' | 'pending'`
  - `eventStatusSeverity(status) -> 'success' | 'danger' | 'secondary'` (maps the three statuses for the PrimeVue Tag)
  - `formatEventDate(dateStr) -> string` (e.g. `"06/26/2026 02:00 PM"`; `''` for falsy input)
  - `outcomeLabel(entry) -> string` (e.g. `"Sent 06/26/2026 02:00 PM"`, `"Failed …"`, `"Created …"`)
  - `eventTypeLabel(eventType) -> string` (capitalized first letter; `''` for falsy)
  - `recipientNames(entry) -> string` (comma-joined `fullName`s, or `'—'` when none)
  - `sortHistory(history) -> Array` (new array, sorted by `createdAt` desc; `[]` for non-array input)

- [ ] **Step 1: Write the failing tests**

Create `client/src/features/ServiceRequestList/lib/notificationHistory.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  eventStatus,
  eventStatusSeverity,
  formatEventDate,
  outcomeLabel,
  eventTypeLabel,
  recipientNames,
  sortHistory,
} from './notificationHistory.js'

describe('eventStatus', () => {
  it('returns sent when sentAt is set', () => {
    expect(eventStatus({ sentAt: '2026-06-26T14:00:05Z', failedAt: null })).toBe('sent')
  })
  it('returns failed when failedAt is set', () => {
    expect(eventStatus({ sentAt: null, failedAt: '2026-06-26T14:00:05Z' })).toBe('failed')
  })
  it('returns pending when neither is set', () => {
    expect(eventStatus({ sentAt: null, failedAt: null })).toBe('pending')
  })
  it('returns pending when both keys absent', () => {
    expect(eventStatus({})).toBe('pending')
  })
})

describe('eventStatusSeverity', () => {
  it('maps sent to success', () => expect(eventStatusSeverity('sent')).toBe('success'))
  it('maps failed to danger', () => expect(eventStatusSeverity('failed')).toBe('danger'))
  it('maps pending to secondary', () => expect(eventStatusSeverity('pending')).toBe('secondary'))
})

describe('formatEventDate', () => {
  it('returns empty string for falsy input', () => {
    expect(formatEventDate(null)).toBe('')
    expect(formatEventDate(undefined)).toBe('')
    expect(formatEventDate('')).toBe('')
  })
  it('formats a date string to a non-empty localized string', () => {
    const out = formatEventDate('2026-06-26T14:00:00Z')
    expect(typeof out).toBe('string')
    expect(out.length).toBeGreaterThan(0)
  })
})

describe('outcomeLabel', () => {
  it('prefixes Sent for a sent event', () => {
    expect(outcomeLabel({ sentAt: '2026-06-26T14:00:05Z' })).toMatch(/^Sent /)
  })
  it('prefixes Failed for a failed event', () => {
    expect(outcomeLabel({ failedAt: '2026-06-26T14:00:05Z' })).toMatch(/^Failed /)
  })
  it('prefixes Created for a pending event using createdAt', () => {
    expect(outcomeLabel({ createdAt: '2026-06-26T14:00:00Z' })).toMatch(/^Created /)
  })
})

describe('eventTypeLabel', () => {
  it('capitalizes the first letter', () => {
    expect(eventTypeLabel('open')).toBe('Open')
    expect(eventTypeLabel('confirmed')).toBe('Confirmed')
  })
  it('returns empty string for falsy input', () => {
    expect(eventTypeLabel('')).toBe('')
    expect(eventTypeLabel(null)).toBe('')
  })
})

describe('recipientNames', () => {
  it('joins multiple fullNames with commas (broadcast case)', () => {
    const entry = { recipients: [{ fullName: 'Jane Doe' }, { fullName: 'John Smith' }, { fullName: 'Maria Lopez' }] }
    expect(recipientNames(entry)).toBe('Jane Doe, John Smith, Maria Lopez')
  })
  it('returns a single name unchanged', () => {
    expect(recipientNames({ recipients: [{ fullName: 'Jane Doe' }] })).toBe('Jane Doe')
  })
  it('returns the dash placeholder for empty recipients', () => {
    expect(recipientNames({ recipients: [] })).toBe('—')
  })
  it('returns the dash placeholder when recipients is absent', () => {
    expect(recipientNames({})).toBe('—')
  })
})

describe('sortHistory', () => {
  it('sorts by createdAt descending (newest first)', () => {
    const history = [
      { id: 1, createdAt: '2026-06-26T10:00:00Z' },
      { id: 2, createdAt: '2026-06-26T14:00:00Z' },
      { id: 3, createdAt: '2026-06-26T12:00:00Z' },
    ]
    expect(sortHistory(history).map(e => e.id)).toEqual([2, 3, 1])
  })
  it('does not mutate the input array', () => {
    const history = [
      { id: 1, createdAt: '2026-06-26T10:00:00Z' },
      { id: 2, createdAt: '2026-06-26T14:00:00Z' },
    ]
    const before = history.map(e => e.id)
    sortHistory(history)
    expect(history.map(e => e.id)).toEqual(before)
  })
  it('returns an empty array for non-array input', () => {
    expect(sortHistory(null)).toEqual([])
    expect(sortHistory(undefined)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx vitest run src/features/ServiceRequestList/lib/notificationHistory.test.js`
Expected: FAIL — cannot resolve `./notificationHistory.js` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `client/src/features/ServiceRequestList/lib/notificationHistory.js`:

```js
// Pure logic for the notification-history UI. All branching that can be wrong
// (status derivation, timestamp selection, recipient formatting, sort order)
// lives here so it can be unit-tested without a component test harness.

export const eventStatus = (entry) => {
  if (entry?.sentAt) return 'sent'
  if (entry?.failedAt) return 'failed'
  return 'pending'
}

export const eventStatusSeverity = (status) => {
  switch (status) {
    case 'sent': return 'success'
    case 'failed': return 'danger'
    default: return 'secondary'
  }
}

export const formatEventDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export const outcomeLabel = (entry) => {
  const status = eventStatus(entry)
  if (status === 'sent') return `Sent ${formatEventDate(entry.sentAt)}`
  if (status === 'failed') return `Failed ${formatEventDate(entry.failedAt)}`
  return `Created ${formatEventDate(entry?.createdAt)}`
}

export const eventTypeLabel = (eventType) => {
  if (!eventType) return ''
  return eventType.charAt(0).toUpperCase() + eventType.slice(1)
}

export const recipientNames = (entry) => {
  const names = (entry?.recipients ?? []).map(r => r.fullName).filter(Boolean)
  return names.length ? names.join(', ') : '—'
}

export const sortHistory = (history) =>
  (Array.isArray(history) ? [...history] : [])
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/features/ServiceRequestList/lib/notificationHistory.test.js`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/ServiceRequestList/lib/notificationHistory.js client/src/features/ServiceRequestList/lib/notificationHistory.test.js
git commit -m "feat: notification history pure-logic helpers + tests"
```

---

### Task 2: Presentational NotificationHistoryList component

Renders the helper output. No data fetching, no dialog knowledge. Verified manually (no component test infra per Global Constraints).

**Files:**
- Create: `client/src/features/ServiceRequestList/components/NotificationHistoryList.vue`

**Interfaces:**
- Consumes: all named exports from `../lib/notificationHistory.js` (Task 1); PrimeVue `Tag`.
- Produces (consumed by Task 3): a component with a single prop `history: Array` (default `() => []`). Renders one row per entry, or an empty message when `history` is empty.

- [ ] **Step 1: Create the component**

Create `client/src/features/ServiceRequestList/components/NotificationHistoryList.vue`:

```vue
<script setup>
import { computed } from 'vue'
import Tag from 'primevue/tag'
import {
  eventStatus,
  eventStatusSeverity,
  outcomeLabel,
  eventTypeLabel,
  recipientNames,
  sortHistory,
} from '../lib/notificationHistory.js'

defineOptions({ name: 'NotificationHistoryList' })

const props = defineProps({
  history: { type: Array, default: () => [] },
})

const sorted = computed(() => sortHistory(props.history))
</script>

<template>
  <div class="notification-history">
    <p v-if="sorted.length === 0" class="empty-message">
      No notifications sent yet.
    </p>
    <div
      v-for="entry in sorted"
      v-else
      :key="entry.id"
      class="history-row"
    >
      <div class="history-row-top">
        <span class="event-type">{{ eventTypeLabel(entry.eventType) }}</span>
        <Tag
          :value="eventStatus(entry)"
          :severity="eventStatusSeverity(eventStatus(entry))"
        />
        <span class="outcome-time">{{ outcomeLabel(entry) }}</span>
      </div>
      <div class="recipients">{{ recipientNames(entry) }}</div>
    </div>
  </div>
</template>

<style scoped>
.notification-history {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.empty-message {
  color: var(--color-text-dim);
  font-style: italic;
  margin: 0;
}

.history-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border-default);
}

.history-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.history-row-top {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.event-type {
  font-weight: 600;
  color: var(--color-text-primary);
}

.outcome-time {
  font-size: 0.85rem;
  color: var(--color-text-dim);
  margin-left: auto;
}

.recipients {
  font-size: 0.9rem;
  color: var(--color-text-primary);
  word-break: break-word;
}
</style>
```

- [ ] **Step 2: Verify the project still builds / lints**

Run: `cd client && npx vitest run` (confirms Task 1 tests still pass and nothing broke at import time)
Expected: PASS — existing suite green.

Manual check (note for reviewer; not automated): component renders rows for a populated `history` and the empty message for `[]`.

- [ ] **Step 3: Commit**

```bash
git add client/src/features/ServiceRequestList/components/NotificationHistoryList.vue
git commit -m "feat: NotificationHistoryList presentational component"
```

---

### Task 3: NotificationHistoryDialog container component

Owns the fetch + loading/error/empty/loaded states; wraps `NotificationHistoryList` in a PrimeVue `Dialog`.

**Files:**
- Create: `client/src/features/ServiceRequestList/components/NotificationHistoryDialog.vue`

**Interfaces:**
- Consumes: `getServiceRequest(serviceRequestId, projection)` from `../api/serviceRequestApi.js`; `useAsyncState` from `../../../shared/composables/useAsyncState.js`; `NotificationHistoryList` (Task 2); PrimeVue `Dialog`, `ProgressSpinner`.
- Produces (consumed by Task 4): a component with props `visible: Boolean` (v-model), `serviceRequestId: [String, Number]`, `displayLabel: [String, Number]`. Emits `update:visible`. Fetches on each open.

- [ ] **Step 1: Create the component**

Create `client/src/features/ServiceRequestList/components/NotificationHistoryDialog.vue`:

```vue
<script setup>
import { computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import ProgressSpinner from 'primevue/progressspinner'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { getServiceRequest } from '../api/serviceRequestApi.js'
import NotificationHistoryList from './NotificationHistoryList.vue'

defineOptions({ name: 'NotificationHistoryDialog' })

const props = defineProps({
  visible: { type: Boolean, default: false },
  serviceRequestId: { type: [String, Number], default: null },
  displayLabel: { type: [String, Number], default: null },
})

const emit = defineEmits(['update:visible'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
})

// Fetch is manual (immediate: false) and re-triggered every time the dialog
// opens, so the history is always fresh. onError is null so a failure shows
// our inline message instead of the global error modal.
const { state: request, isLoading, error, execute: fetchHistory } = useAsyncState(
  () => getServiceRequest(props.serviceRequestId, ['notificationHistory']),
  { immediate: false, onError: null },
)

const history = computed(() => request.value?.notificationHistory ?? [])

const title = computed(() =>
  props.displayLabel != null ? `Notifications — #${props.displayLabel}` : 'Notifications',
)

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible && props.serviceRequestId != null) {
      fetchHistory()
    }
  },
)
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    :header="title"
    :style="{ width: '32rem' }"
    :breakpoints="{ '640px': '90vw' }"
  >
    <div v-if="isLoading" class="dialog-state">
      <ProgressSpinner style="width: 2rem; height: 2rem" strokeWidth="4" />
      <span>Loading…</span>
    </div>
    <p v-else-if="error" class="dialog-state error">
      Couldn't load notification history.
    </p>
    <NotificationHistoryList v-else :history="history" />
  </Dialog>
</template>

<style scoped>
.dialog-state {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--color-text-dim);
  padding: 0.5rem 0;
}

.dialog-state.error {
  color: var(--color-text-error);
  margin: 0;
}
</style>
```

- [ ] **Step 2: Verify nothing broke at import time**

Run: `cd client && npx vitest run`
Expected: PASS — existing suite still green (imports resolve).

Manual check (note for reviewer): opening the dialog triggers a fetch with projection `['notificationHistory']`; loading → list transition works; a forced fetch rejection shows the inline error.

- [ ] **Step 3: Commit**

```bash
git add client/src/features/ServiceRequestList/components/NotificationHistoryDialog.vue
git commit -m "feat: NotificationHistoryDialog container component"
```

---

### Task 4: Wire the bell action into ServiceRequestList

Make the Actions column appear in both modes, add the bell on every row, keep the edit pencil meta-only, and mount the dialog.

**Files:**
- Modify: `client/src/features/ServiceRequestList/components/ServiceRequestList.vue`

**Interfaces:**
- Consumes: `NotificationHistoryDialog` (Task 3).
- Produces: nothing consumed by other tasks (terminal task).

- [ ] **Step 1: Import the dialog and add dialog state**

In the `<script setup>` block of `ServiceRequestList.vue`, add the import alongside the existing component imports (near the `import Button from 'primevue/button'` line):

```js
import NotificationHistoryDialog from './NotificationHistoryDialog.vue'
```

Then, near the other `ref(...)` declarations (e.g. after `const idSearch = ref('')`), add:

```js
const historyDialogVisible = ref(false)
const historyRequestId = ref(null)
const historyRequestLabel = ref(null)

const openHistory = (row) => {
  historyRequestId.value = row.serviceRequestId
  historyRequestLabel.value = row.displayNumber
  historyDialogVisible.value = true
}
```

- [ ] **Step 2: Make the Actions column visible in both modes and add the bell**

In the template, replace the existing Actions column block:

```vue
      <Column v-if="isMetaMode" header="Actions" style="width: 8%">
        <template #body="slotProps">
          <Button
            v-if="['open', 'confirmed', 'draft'].includes(slotProps.data.status?.toLowerCase())"
            icon="pi pi-pencil"
            class="p-button-rounded p-button-text p-button-sm"
            @click="navigateToEditRequest(slotProps.data.serviceRequestId)"
          />
        </template>
      </Column>
```

with this (drop the `v-if` on the column; add the bell button; keep the pencil guarded):

```vue
      <Column header="Actions" style="width: 10%">
        <template #body="slotProps">
          <Button
            icon="pi pi-bell"
            class="p-button-rounded p-button-text p-button-sm"
            aria-label="Notification history"
            @click.stop="openHistory(slotProps.data)"
          />
          <Button
            v-if="isMetaMode && ['open', 'confirmed', 'draft'].includes(slotProps.data.status?.toLowerCase())"
            icon="pi pi-pencil"
            class="p-button-rounded p-button-text p-button-sm"
            @click.stop="navigateToEditRequest(slotProps.data.serviceRequestId)"
          />
        </template>
      </Column>
```

(Note: `@click.stop` added to the pencil too, so editing also never triggers row navigation.)

- [ ] **Step 3: Mount the dialog**

In the template, immediately before the closing `</div>` of `.service-request-list` (after the mobile card list block), add:

```vue
    <NotificationHistoryDialog
      v-model:visible="historyDialogVisible"
      :service-request-id="historyRequestId"
      :display-label="historyRequestLabel"
    />
```

- [ ] **Step 4: Verify the suite still passes**

Run: `cd client && npx vitest run`
Expected: PASS — full suite green (no new automated tests here; this task is verified manually in the running app).

- [ ] **Step 5: Manual verification in the dev app**

(Reviewer note — not a scripted step.) With the API and client dev servers running:
1. Open the Service Requests list in **village mode** → Actions column present, bell on every row, no pencil.
2. Open in **meta mode** → bell on every row; pencil only on open/confirmed/draft rows.
3. Click a bell → dialog opens titled "Notifications — #<displayNumber>", shows loading then the history (or "No notifications sent yet.").
4. Confirm clicking the bell does NOT navigate to the detail view.
5. Reopen the same row's bell → it re-fetches (fresh data).

- [ ] **Step 6: Commit**

```bash
git add client/src/features/ServiceRequestList/components/ServiceRequestList.vue
git commit -m "feat: bell action opens notification history dialog from SR list"
```

---

## Notes for the implementer

- **Restart the API after any `api/source/` edits** — not applicable here (client-only), but the client dev server hot-reloads.
- **PrimeVue component names:** `Dialog` → `primevue/dialog`, `ProgressSpinner` → `primevue/progressspinner`, `Tag` → `primevue/tag`, `Button` → `primevue/button`. If unsure of any PrimeVue API, check Context7 (`/websites/primevue`) before guessing.
- The `getServiceRequest` API client function returns the service-request object directly (the controller's projection puts `notificationHistory` on that object), so `request.value.notificationHistory` is the array.
- Each `notificationHistory` entry shape: `{ id, eventType, createdAt, sentAt, failedAt, recipients: [{ id, fullName }] }`.
