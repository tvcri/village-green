# Cancel Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Cancel Request" button (edit mode only) that opens a popover with three cancellation reasons, patches the API, and navigates away on success; also rename the abandon-edit button from "Cancel" to "Close".

**Architecture:** All changes are confined to a single Vue component. A new `Popover` component (already used in `FriendList`) is anchored to a new danger-severity "Cancel Request" button. The cancel action reuses the existing `updateServiceRequest` API client function. No new files are created.

**Tech Stack:** Vue 3 (Composition API), PrimeVue (`Popover`, `Button`), Vitest + @testing-library/vue for tests.

## Global Constraints

- Status strings must exactly match the existing API convention: `"Member cancelled"`, `"Volunteer cancelled"`, `"Hub cancelled"` (note capitalisation).
- Cancel Request button is only rendered when `isEdit` is `true`.
- Cancel Request button is disabled when `isSubmitting || isCancelling` is `true`, or when the current status already contains `"cancelled"` (case-insensitive).
- After a successful cancel PATCH, navigate to `meta-service-requests` (same route used by the Update success path).
- Do not touch `computedStatus`, `handleSubmit`, or any form fields.

---

### Task 1: Rename "Cancel" → "Close" and add Cancel Request button with popover

**Files:**
- Modify: `client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue`

**Interfaces:**
- Consumes: `updateServiceRequest(serviceRequestId, payload)` from `../api/serviceRequestApi.js` — already imported via `apiCall` in the component; import `updateServiceRequest` named export directly.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Import Popover and updateServiceRequest**

In the `<script setup>` block, add these two imports alongside the existing ones:

```js
import Popover from 'primevue/popover'
import { updateServiceRequest } from '../api/serviceRequestApi.js'
```

- [ ] **Step 2: Add isCancelling ref and cancelPopover template ref**

After the existing `const isSubmitting = ref(false)` line, add:

```js
const isCancelling = ref(false)
const cancelPopover = ref(null)
```

- [ ] **Step 3: Add the handleCancelRequest function**

After the existing `handleCancel` function, add:

```js
const CANCEL_REASONS = ['Member cancelled', 'Volunteer cancelled', 'Hub cancelled']

const isCancelled = computed(() =>
  existingRequest.value?.status?.toLowerCase().includes('cancelled') ?? false
)

const handleCancelRequest = async (reason) => {
  cancelPopover.value.hide()
  isCancelling.value = true
  try {
    await updateServiceRequest(serviceRequestId.value, { status: reason })
    toast.add({ severity: 'success', summary: 'Success', detail: 'Service request cancelled', life: 3000 })
    setTimeout(() => {
      router.push({ name: 'meta-service-requests' })
    }, 500)
  } catch (err) {
    console.error(err)
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to cancel service request', life: 5000 })
  } finally {
    isCancelling.value = false
  }
}
```

- [ ] **Step 4: Update the template — rename "Cancel" button to "Close"**

Find the existing Cancel button in the `<!-- Actions -->` section:

```html
<Button
  type="button"
  label="Cancel"
  severity="secondary"
  @click="handleCancel"
  :disabled="isSubmitting"
/>
```

Replace `label="Cancel"` with `label="Close"`:

```html
<Button
  type="button"
  label="Close"
  severity="secondary"
  @click="handleCancel"
  :disabled="isSubmitting"
/>
```

- [ ] **Step 5: Add Cancel Request button and Popover to the template**

In the `<!-- Actions -->` section, insert the Cancel Request button and its Popover **between** the Close button and the Update/Create button:

```html
<!-- Cancel Request (edit only) -->
<template v-if="isEdit">
  <Button
    type="button"
    label="Cancel Request"
    severity="danger"
    :disabled="isSubmitting || isCancelling || isCancelled"
    @click="(e) => cancelPopover.toggle(e)"
  />
  <Popover ref="cancelPopover">
    <div style="display: flex; flex-direction: column; gap: 0.25rem; min-width: 180px;">
      <Button
        v-for="reason in CANCEL_REASONS"
        :key="reason"
        :label="reason"
        text
        severity="danger"
        style="justify-content: flex-start;"
        @click="handleCancelRequest(reason)"
      />
    </div>
  </Popover>
</template>
```

The full `<!-- Actions -->` div should now read:

```html
<!-- Actions -->
<div class="form-actions">
  <Button
    type="button"
    label="Close"
    severity="secondary"
    @click="handleCancel"
    :disabled="isSubmitting"
  />
  <template v-if="isEdit">
    <Button
      type="button"
      label="Cancel Request"
      severity="danger"
      :disabled="isSubmitting || isCancelling || isCancelled"
      @click="(e) => cancelPopover.toggle(e)"
    />
    <Popover ref="cancelPopover">
      <div style="display: flex; flex-direction: column; gap: 0.25rem; min-width: 180px;">
        <Button
          v-for="reason in CANCEL_REASONS"
          :key="reason"
          :label="reason"
          text
          severity="danger"
          style="justify-content: flex-start;"
          @click="handleCancelRequest(reason)"
        />
      </div>
    </Popover>
  </template>
  <Button
    type="submit"
    :label="isEdit ? 'Update' : 'Create'"
    :loading="isSubmitting"
    :disabled="!isFormValid || isSubmitting"
  />
</div>
```

- [ ] **Step 6: Manually verify in the browser**

Start the dev server if not running:
```bash
cd /home/csmig/dev/village-green/client && npm run dev
```

Open an existing service request in edit mode. Verify:
1. Button bar shows: **Close** | **Cancel Request** | **Update**
2. "Cancel Request" is red (danger severity).
3. Clicking "Cancel Request" opens a popover with three rows: "Member cancelled", "Volunteer cancelled", "Hub cancelled".
4. Clicking a reason closes the popover, patches the API (check Network tab — PATCH to `/service-requests/{id}` with `{ "status": "Member cancelled" }` or equivalent), shows success toast, and navigates to the list.
5. Clicking "Close" navigates away without saving.
6. Open a service request that is already cancelled — "Cancel Request" button should be disabled.
7. In create mode, only "Close" and "Create" appear (no "Cancel Request").

- [ ] **Step 7: Commit**

```bash
git add client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue
git commit -m "feat: add Cancel Request button with popover to service request edit form"
```

---

## Follow-up (out of scope for this plan)

The API's `getServiceRequests` server-side cancelled filter (`ServiceRequestService.js` lines 127-128) currently only maps to `'Member cancelled'` and `'Volunteer cancelled'`. `'Hub cancelled'` should be added there so the "Cancelled" filter checkbox in the list catches hub-cancelled requests when server-side filtering is active.
