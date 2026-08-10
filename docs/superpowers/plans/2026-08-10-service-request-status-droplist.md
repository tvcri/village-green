# Service Request Status Droplist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace derived completion with an explicit status droplist in the actions row, so a terminal service request can be edited without its status changing by inference.

**Architecture:** `status` is a projection of volunteer presence for `Open`/`Confirmed` but an asserted fact for the five end states. The shipped client derives completion from a volunteer edit, which mis-fires on any cancelled request that already had a volunteer (#27233). This plan removes that derivation and its dependents, and adds a droplist bound to `form.status` that appears only when the request is terminal. The API is untouched.

**Tech Stack:** Vue 3 SFC + PrimeVue (`Select`), Vitest + @testing-library/vue.

**Spec:** `docs/superpowers/specs/2026-08-10-service-request-status-droplist-design.md` (untracked — `docs/superpowers/specs/*` is gitignored).

## Global Constraints

- **All work is on branch `sr-cancelled-status-edit`.** Verify with `git branch --show-current` before any write. Never commit to `main`. Do not open a PR.
- **The API is untouched.** No file under `api/` changes, and `test/api` needs no new tests. All three rules in `patchServiceRequest`, the terminal-row short-circuit, and the OAS ship as already reviewed.
- **The five end states** are `Completed`, `Member cancelled`, `Volunteer cancelled`, `Hub cancelled`, `Unmatched`. The two non-terminal states are `Open` and `Confirmed`. Exact strings, lowercase "cancelled" with a double L.
- **Droplist options are exactly four:** `Member cancelled`, `Volunteer cancelled`, `Hub cancelled`, `Completed`. `Unmatched` is displayed when it is the current value but is **never selectable**. `Open` and `Confirmed` never appear.
- **The droplist renders only when the request is in an end state**, and only in edit mode. Non-terminal requests keep the existing Cancel Request button in that slot, unchanged.
- **Status commits on Save**, with the rest of the form — never on selection.
- **The header `Tag` stays** as the always-on, read-only status display for every request. It is already bound to `computedStatus`, so it previews the pending selection.
- **`Set Completed`** (header button, gated on `isConfirmed`) and `handleComplete` are **kept unchanged** — `Confirmed → Completed` stays one click.
- **Validation that must explain itself goes in `handleSubmit` with a toast, not `isFormValid`** — convention documented at `ServiceRequestCreateEdit.vue:517-520`: a disabled Save button cannot be clicked to explain why it is disabled.
- **Required-field marker convention** is `<span class="req">*</span>`, conditionally rendered where needed (see `:1223` for the existing conditional form).
- Client tests need the `// @vitest-environment jsdom` pragma and run from `client/`. `npx vitest run <path> -t "<name>"` filters correctly.
- **Never restart the dev API or dev server.** Ask the user; Task 5 depends on this.
- Keep test work proportionate to feature work.

---

### Task 1: Remove the derived-completion machinery

**Files:**
- Modify: `client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue`
- Modify: `client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a `computedStatus` with no `isCancelled` branch, which Task 2 binds the droplist to.

This task only deletes. The droplist arrives in Task 2, so between these two commits a cancelled request has no way to change its status from the UI — that is expected and is why they land in sequence.

- [ ] **Step 1: Delete the failing/obsolete tests first**

In `ServiceRequestCreateEdit.test.js`, delete these two entire `describe` blocks:
- `describe('cancelled request status editing', ...)` — the reason-popover tests
- `describe('completing a cancelled request by attaching a volunteer', ...)` — the derived-completion and commitment-notice tests

Leave every other `describe` block alone, in particular `describe('Completed requests require a volunteer', ...)` (Task 6's guard, which survives) and all create-mode tests.

- [ ] **Step 2: Run the suite to confirm only the intended tests are gone**

Run: `cd client && npx vitest run src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js`

Expected: PASS. The file's remaining tests still pass because the component has not changed yet. Note the test count — you will compare against it in Step 6.

- [ ] **Step 3: Simplify `computedStatus` and delete `willCompleteOnSave`**

Replace the whole block at `:330-344`:

```js
const computedStatus = computed(() => {
  if (statusOverride.value) return statusOverride.value
  // Attaching a volunteer to a cancelled request completes it on save —
  // the same shape as Open -> Confirmed, but terminal and not reversible
  // by clearing the field after save.
  if (isCancelled.value) {
    return form.value.volunteerPersonId ? 'Completed' : existingRequest.value.status
  }
  if (CLIENT_STATUSES.includes(form.value.status)) return form.value.status
  return form.value.volunteerPersonId ? 'Confirmed' : 'Open'
})

const willCompleteOnSave = computed(() =>
  isCancelled.value && !!form.value.volunteerPersonId
)
```

with:

```js
const computedStatus = computed(() => {
  if (statusOverride.value) return statusOverride.value
  // Terminal statuses are asserted by the user through the status droplist and
  // held in form.status; Open/Confirmed remain derived from volunteer presence.
  if (CLIENT_STATUSES.includes(form.value.status)) return form.value.status
  return form.value.volunteerPersonId ? 'Confirmed' : 'Open'
})
```

- [ ] **Step 4: Delete the commitment notice from the template**

Remove this block (at `:983-989`, immediately after the volunteer field's `person-field-row` div closes):

```vue
              <Message
                v-if="willCompleteOnSave"
                severity="warn"
                :closable="false"
              >
                Saving will mark this request Completed.
              </Message>
```

Then check whether `Message` (imported at `:17` from `primevue/message`) is used anywhere else in the file:

Run: `cd client && grep -n "<Message" src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue`

If there are no remaining uses, delete the `import Message from 'primevue/message'` line at `:17`. If there are, leave the import.

- [ ] **Step 5: Delete the reason-changer**

Delete these three script items:
- `changeReasonPopover` ref (`:102`)
- `changeReasonOptions` computed and its comment (`:840-845`)
- `handleChangeReason` (`:847-855`)

Then in the template, replace the entire `<template v-if="isCancelled">` / `<template v-else>` pair inside the actions row (`:1288-1310` through the `v-else`'s closing tag) with just the Cancel Request button and its `cancelPopover`, unwrapped — i.e. what the `v-else` branch currently contains, promoted to be the only content of `<template v-if="isEdit">`.

The result should read:

```vue
            <template v-if="isEdit">
              <Button
                type="button"
                label="Cancel Request"
                severity="danger"
                ... (rest of the existing Cancel Request button, unchanged)
              />
              <Popover ref="cancelPopover">
                ... (existing cancelPopover contents, unchanged)
              </Popover>
            </template>
```

Do not otherwise modify the Cancel Request button or `cancelPopover`.

Finally, check whether `isCancelled` (`:778-780`) still has any users:

Run: `cd client && grep -n "isCancelled" src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue`

If the only remaining hit is its own declaration, delete the declaration. If the Cancel Request button's `:disabled` still references it, leave both — that is pre-existing and harmless.

- [ ] **Step 6: Run the full client suite**

Run: `cd client && npx vitest run`

Expected: all PASS, with the test count down by exactly the tests deleted in Step 1. If any *other* test fails, something in Steps 3-5 removed more than intended — report it rather than patching the test.

- [ ] **Step 7: Commit**

```bash
git add client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js
git commit -m "refactor(client): remove derived completion from cancelled requests

Deriving Completed from volunteer presence mis-fired on any cancelled
request that already had a volunteer, previewing Completed on load and
marking the request Completed on an unrelated save (#27233). The status
droplist replaces this in the next commit."
```

---

### Task 2: Add the status droplist

**Files:**
- Modify: `client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue`
- Test: `client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js`

**Interfaces:**
- Consumes: `computedStatus` (simplified in Task 1), `form.status`, `existingRequest`, `isEdit`, `CLIENT_STATUSES` (`:328`).
- Produces: `isTerminal` and `statusOptions` computeds, plus a `Select` bound to `form.status`. Task 3 adds the volunteer requirement keyed on `computedStatus`; Task 4 asserts the regression against this markup.

`form.status` is already seeded from the loaded request by the `existingRequest` watcher (`:124`, `status: val.status || ''`), so the droplist binds straight to it with no new plumbing.

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `ServiceRequestCreateEdit.test.js`. It uses the existing `mountEditAndExpose` helper and the file's `unref()` helper.

```js
describe('status droplist', () => {
  const cancelledRequest = {
    serviceRequestId: 1, requestNumber: 1, villageId: '1', memberPersonId: '7',
    serviceName: 'Errand: Shopping', serviceDate: '2026-08-01',
    status: 'Member cancelled', volunteerPersonId: null
  }

  it('offers the other cancel reasons plus Completed on a cancelled request', async () => {
    const vm = await mountEditAndExpose(cancelledRequest)
    expect(unref(vm.isTerminal)).toBe(true)
    expect(unref(vm.statusOptions)).toEqual([
      'Member cancelled', 'Volunteer cancelled', 'Hub cancelled', 'Completed'
    ])
  })

  it('does not render the droplist on a non-terminal request', async () => {
    const vm = await mountEditAndExpose({ ...cancelledRequest, status: 'Open' })
    expect(unref(vm.isTerminal)).toBe(false)
  })

  it('shows Unmatched as the current value but never as a choice', async () => {
    const vm = await mountEditAndExpose({ ...cancelledRequest, status: 'Unmatched' })
    expect(unref(vm.isTerminal)).toBe(true)
    expect(unref(vm.statusOptions)).not.toContain('Unmatched')
    // The stored value still displays, so the user can see what the request is.
    expect(unref(vm.computedStatus)).toBe('Unmatched')
  })

  it('previews the pending selection in the header Tag before saving', async () => {
    const vm = await mountEditAndExpose(cancelledRequest)
    expect(unref(vm.computedStatus)).toBe('Member cancelled')

    vm.form.status = 'Hub cancelled'
    await waitFor(() => expect(unref(vm.computedStatus)).toBe('Hub cancelled'))
    // Nothing was saved — the preview is local until Save.
    const { apiCall } = await import('../../../shared/api/apiClient.js')
    expect(apiCall).not.toHaveBeenCalled()
  })

  it('sends the selected status on save', async () => {
    const { apiCall } = await import('../../../shared/api/apiClient.js')
    const vm = await mountEditAndExpose(cancelledRequest)

    vm.form.status = 'Hub cancelled'
    await vm.handleSubmit(false)

    const [, , payload] = apiCall.mock.calls.at(-1)
    expect(payload.status).toBe('Hub cancelled')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx vitest run src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js -t "status droplist"`

Expected: FAIL — `isTerminal` and `statusOptions` are undefined.

- [ ] **Step 3: Add the script logic**

Add beside the other status computeds, after `computedStatus` (which Task 1 left at roughly `:330-337`):

```js
// The five end states. Terminal rows assert their status through the droplist;
// Open/Confirmed derive it, so they get no droplist.
const END_STATES = ['Completed', 'Member cancelled', 'Volunteer cancelled', 'Hub cancelled', 'Unmatched']

const isTerminal = computed(() => END_STATES.includes(existingRequest.value?.status))

// Unmatched is assigned by the overnight job, never asserted by staff — it
// displays when current (via the Tag and the Select's own value) but is not a
// choice. Open/Confirmed are derived, so they are never offered either.
const statusOptions = computed(() => [
  'Member cancelled', 'Volunteer cancelled', 'Hub cancelled', 'Completed'
])
```

`statusOptions` holds the same four strings as `CLIENT_STATUSES` (`:328`) but in reading order — the three cancel reasons first, then `Completed` — which is the order the Step 1 test asserts. **Do not modify `CLIENT_STATUSES` itself, and do not derive `statusOptions` from it:** `handleSubmit` and `computedStatus` depend on `CLIENT_STATUSES` for membership, and reordering it to serve the droplist would couple a display concern to a validation constant.

- [ ] **Step 4: Add the droplist to the actions row**

`Select` is PrimeVue's dropdown. Check whether it is already imported:

Run: `cd client && grep -n "primevue/select" src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue`

If absent, add `import Select from 'primevue/select'` alongside the other PrimeVue imports.

In the actions row, inside `<template v-if="isEdit">`, put the droplist ahead of the Cancel Request button and make them mutually exclusive:

```vue
            <template v-if="isEdit">
              <Select
                v-if="isTerminal"
                v-model="form.status"
                :options="statusOptions"
                placeholder="Status"
                aria-label="Request status"
                :disabled="isSubmitting"
                style="min-width: 12rem;"
              />
              <template v-else>
                ... (the Cancel Request button and cancelPopover from Task 1, unchanged)
              </template>
            </template>
```

The droplist sits left of Close and Save because it is the first child of the actions row — a save-time decision belongs beside Save, not at the top of a long form.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js -t "status droplist"`
Expected: all five PASS.

- [ ] **Step 6: Run the full client suite**

Run: `cd client && npx vitest run`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js
git commit -m "feat(client): add a status droplist for terminal service requests

Staff assert a terminal request's status directly and commit it with Save,
rather than having it inferred from a volunteer edit. Unmatched displays
when current but is never offered, since the overnight job assigns it."
```

---

### Task 3: Mark the volunteer required when Completed is selected

**Files:**
- Modify: `client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue`
- Test: `client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js`

**Interfaces:**
- Consumes: `computedStatus` from Task 1, the droplist from Task 2.
- Produces: nothing consumed by later tasks.

The save-time guard already exists in `handleSubmit` and is **kept as-is** — this task only adds the up-front visual signal so the requirement is visible before the user commits. Do not move or duplicate the guard.

- [ ] **Step 1: Confirm the existing guard is intact**

Run: `cd client && grep -n "A completed request must have a volunteer" src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue`

Expected: one hit, inside `handleSubmit`. If it is missing, stop and report — Task 1 removed something it should not have.

- [ ] **Step 2: Write the failing test**

```js
describe('volunteer requirement when completing', () => {
  const cancelledRequest = {
    serviceRequestId: 1, requestNumber: 1, villageId: '1', memberPersonId: '7',
    serviceName: 'Errand: Shopping', serviceDate: '2026-08-01',
    status: 'Member cancelled', volunteerPersonId: null
  }

  it('marks the volunteer field required once Completed is selected', async () => {
    const vm = await mountEditAndExpose(cancelledRequest)
    expect(screen.queryByTestId('volunteer-required')).toBeNull()

    vm.form.status = 'Completed'
    await waitFor(() => {
      expect(screen.getByTestId('volunteer-required')).toBeTruthy()
    })
  })

  it('drops the marker when a non-completing status is selected', async () => {
    const vm = await mountEditAndExpose(cancelledRequest)

    vm.form.status = 'Completed'
    await waitFor(() => expect(screen.getByTestId('volunteer-required')).toBeTruthy())

    vm.form.status = 'Hub cancelled'
    await waitFor(() => expect(screen.queryByTestId('volunteer-required')).toBeNull())
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd client && npx vitest run src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js -t "volunteer requirement when completing"`
Expected: FAIL — no element with that test id.

- [ ] **Step 4: Add the marker**

The file's required-field convention is `<span class="req">*</span>`, already used conditionally at `:1223` (`<span v-if="isRideService" class="req">*</span>`). Follow that exactly.

In the volunteer field's label (`:954-960`), change:

```vue
              <label class="volunteer-label">
                <span>Volunteer</span>
```

to:

```vue
              <label class="volunteer-label">
                <span>Volunteer<span
                  v-if="computedStatus === 'Completed'"
                  class="req"
                  data-testid="volunteer-required"
                >*</span></span>
```

Keep the `any-village-toggle` span that follows it unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js -t "volunteer requirement when completing"`
Expected: both PASS.

- [ ] **Step 6: Run the full client suite**

Run: `cd client && npx vitest run`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js
git commit -m "feat(client): mark the volunteer required when Completed is selected"
```

---

### Task 4: Pin the #27233 regression

**Files:**
- Test: `client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing.

This is the test the whole redesign exists to make pass. It is written last so it exercises the finished behavior end to end, and it must pass **without any production-code change** — if it fails, Tasks 1-3 are incomplete.

- [ ] **Step 1: Write the regression test**

```js
describe('#27233 — a cancelled request that already has a volunteer', () => {
  // The request was Confirmed with a volunteer, then cancelled. The volunteer
  // is still recorded on it. Before the droplist, computedStatus tested
  // volunteer *presence*, so this previewed Completed on load and any save
  // silently completed the request.
  const cancelledWithVolunteer = {
    serviceRequestId: 27233, requestNumber: 27233, villageId: '1',
    memberPersonId: '7', serviceName: 'Errand: Shopping',
    serviceDate: '2026-08-01', status: 'Member cancelled',
    volunteerPersonId: '9', description: 'original note'
  }

  it('loads showing its cancelled status, not Completed', async () => {
    const vm = await mountEditAndExpose(cancelledWithVolunteer)
    expect(unref(vm.computedStatus)).toBe('Member cancelled')
    expect(screen.queryByTestId('volunteer-required')).toBeNull()
  })

  it('saves an unrelated edit without changing status', async () => {
    const { apiCall } = await import('../../../shared/api/apiClient.js')
    const vm = await mountEditAndExpose(cancelledWithVolunteer)

    vm.form.description = 'edited note'
    await vm.handleSubmit(false)

    const [, , payload] = apiCall.mock.calls.at(-1)
    expect(payload.description).toBe('edited note')
    expect(payload.status).toBe('Member cancelled')
  })
})
```

- [ ] **Step 2: Run it**

Run: `cd client && npx vitest run src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js -t "27233"`

Expected: both PASS with no production change. If either fails, do **not** adjust the test — report which assertion failed and stop. A failure here means the derivation was not fully removed.

- [ ] **Step 3: Run both full suites**

Run: `cd client && npx vitest run`
Run: `cd test/api && npm test`

Expected: client all PASS. API baseline unchanged: **275 tests, 273 pass, 0 fail, 2 pre-existing todo** (`tests/op/jobs.test.js:14` — job table not scaffolded; `tests/users/management.test.js:187` — deleteUser hits the Keycloak admin API, absent in mockOidc). Do not attempt to fix those two.

Note: in the API harness `npm test -- --test-name-pattern=X` does **not** filter (`run.js` ignores extra argv) — grep the TAP output instead.

- [ ] **Step 4: Commit**

```bash
git add client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js
git commit -m "test(client): pin the #27233 cancelled-with-volunteer regression"
```

---

### Task 5: Verify in the running app

**Files:** none — manual verification.

The component tests mount the SFC in isolation with mocked APIs. They cannot prove the droplist sits well in the actions row, that the header Tag preview reads clearly, or that the PATCH round-trips. Per project convention, **ask the user to restart the API** — never restart it yourself.

- [ ] **Step 1: Ask the user to restart the API and confirm the dev stack is up**

- [ ] **Step 2: Walk the paths**

1. **The regression.** Open a cancelled request that already has a volunteer (#27233 if it is still around). Confirm the header Tag reads the cancelled status, not `Completed`, and no required marker sits on the Volunteer field. Edit only the description and Save. **This must succeed and must leave the status unchanged.**
2. **Reason change.** On a cancelled request, pick a different cancel reason from the droplist. Confirm the header Tag previews it immediately, then Save and confirm it persists.
3. **Completion.** On a cancelled request with no volunteer, pick `Completed`. Confirm the Volunteer field gains its `*`. Save with no volunteer and confirm the toast explains the requirement. Attach a volunteer, Save, and confirm the request becomes Completed with the volunteer credited.
4. **Unmatched.** Open an `Unmatched` request. Confirm the droplist shows `Unmatched` as the current value and does not offer it as a choice, and that the four real options are selectable.
5. **Non-terminal untouched.** Open an `Open` request. Confirm there is no droplist and the Cancel Request button is where it always was. Open a `Confirmed` request and confirm `Set Completed` still works in one click.

- [ ] **Step 3: Report findings**

Report what was observed, including anything that reads awkwardly. The droplist's width and its placement relative to Close/Save are the most likely things to want adjustment once seen in context.

---

## Notes for the implementer

**The API is done.** If something seems to need an API change, stop and report — the three rules were reviewed and shipped, and the droplist was designed to fit them. In particular, sending status and volunteer together in one payload is the shape rule 1 permits; a bare volunteer change on a terminal row is what it refuses.

**`Unmatched` sends no status when untouched.** It is deliberately absent from `CLIENT_STATUSES`, so `handleSubmit`'s gate skips it and the API's terminal-row short-circuit leaves the row alone. That is the correct no-op and it falls out of existing code — do not add a special case for it.

**Do not widen the droplist to `Open`/`Confirmed`.** They are derived. Offering them would mean reversing the derivation, and the API refuses the transition anyway.

**`Unmatched` editability is provisional — do not treat it as settled.** The customer never raised `Unmatched`; it is in the droplist because treating all five end states uniformly is the clean rule, not because anyone established that staff should edit these rows. It is the one end state the *system* assigns rather than a person, so it may well come out.

This is deliberately being demoed rather than asked about in advance — the user will raise it with the customer **after** they see the implementation. Build it as specified, and keep the seam cheap to reverse: `isTerminal` is the single point of control, so excluding `Unmatched` later is one condition, and `statusOptions` already never offers it. Do not spread `Unmatched` handling anywhere else.
