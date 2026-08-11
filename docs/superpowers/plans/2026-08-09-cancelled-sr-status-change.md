# Cancelled Service Request Status Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff change a cancelled service request's cancellation reason, or complete it by attaching a volunteer, while making it impossible for any client to move a request backward in its lifecycle.

**Architecture:** Three API validation rules are added to `patchServiceRequest`, which already reads the current row before composing its update — so all three are local checks against data already in hand. The client gains a reason-changing popover in the slot the disabled Cancel Request button currently occupies, and reuses the form's existing volunteer field plus `computedStatus` to make completion a consequence of a data edit rather than a separate action.

**Tech Stack:** Node/Express + MySQL (mysql2 pool), OpenAPI via express-openapi-validator, Vue 3 SFC + PrimeVue, `node:test` for API tests, Vitest + @testing-library/vue for client tests.

**Spec:** `scratch/superpowers/specs/2026-08-09-cancelled-sr-status-change-design.md` (untracked — `scratch/` is gitignored).

## Global Constraints

- **The five end states** are `Completed`, `Member cancelled`, `Volunteer cancelled`, `Hub cancelled`, `Unmatched`. The two non-terminal states are `Open` and `Confirmed`. These strings are exact, including lowercase "cancelled" with a double L.
- **Never backward:** no terminal status may become `Open` or `Confirmed`. Customer-agreed policy, enforced at the API.
- **API rules cover all five end states. The UI covers only the three cancels.** This asymmetry is deliberate — do not widen the UI to `Unmatched`.
- **`status` stays optional on PATCH.** Absence means "leave it alone". Do not add a `required` list or make the OAS reject a missing status.
- Enforcement lives in `ServiceRequestService.patchServiceRequest`, never in the OAS — the spec layer cannot express a condition on current DB state.
- **Validation that must explain itself goes in `handleSubmit` with a toast, not in `isFormValid`.** Existing convention, documented at `ServiceRequestCreateEdit.vue:505-511`: a disabled Save button cannot be clicked to explain why it is disabled.
- `notify: true` may never accompany `Completed` — existing OAS `not` clause plus `writeNotificationEvent` throwing.
- API tests use `node:test` + `assert/strict` + `vgCall`; every created request is pushed to `createdIds` for cleanup in `after()`. The seeded DB is shared with parallel test files.
- Client tests need the `// @vitest-environment jsdom` pragma and run from `client/`.

---

### Task 1: API rule 2 — reject backward status transitions

**Files:**
- Modify: `api/source/service/ServiceRequestService.js:332-384`
- Test: `test/api/tests/service-request/lifecycle.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: module-level `const END_STATES` array and `function isEndState(status)` in `ServiceRequestService.js`, used by Tasks 2 and 3.

- [ ] **Step 1: Write the failing test**

Append to `test/api/tests/service-request/lifecycle.test.js`:

```js
test('rule 2: a cancelled request cannot be moved back to Open or Confirmed', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId

  const cancelled = await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Member cancelled' } })
  assert.equal(cancelled.status, 200)
  assert.equal(cancelled.json.status, 'Member cancelled')

  // 'Open' is not in the Patch enum, so express-openapi-validator rejects it
  // at the spec boundary with a 400 before the service is reached. Assert the
  // rejection, not the specific code: if the enum ever widens, the service
  // layer must still refuse the transition.
  const back = await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Open' } })
  assert.ok(back.status >= 400, `expected rejection, got ${back.status}`)

  const after = await vgCall('getServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  assert.equal(after.json.status, 'Member cancelled')
})

test('rule 2: terminal to terminal is allowed, and rewrites the reason verbatim', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId

  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Member cancelled' } })

  const changed = await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Hub cancelled' } })
  assert.equal(changed.status, 200)
  assert.equal(changed.json.status, 'Hub cancelled')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd test/api && npm test -- --test-name-pattern="rule 2"`

Expected: the "terminal to terminal" test passes already (that path works today). The "cannot be moved back" test may already pass via the enum's 400 — that is fine and expected. It is a regression guard, not a red test. Confirm both run and report the result before continuing.

- [ ] **Step 3: Add the end-state helpers and the rule 2 check**

In `api/source/service/ServiceRequestService.js`, after the existing `CANCELLED_STATUSES` on line 8:

```js
// The five end states. A request in any of these never returns to Open or
// Confirmed — customer-agreed policy, enforced in patchServiceRequest.
const END_STATES = [...CANCELLED_STATUSES, 'Completed', 'Unmatched']

function isEndState(status) {
  return END_STATES.includes(status)
}
```

In `patchServiceRequest`, immediately after `if (!current) return null` (line 340):

```js
      // Rule 2: never backward. The Patch enum already excludes Open and
      // Confirmed, so this is normally unreachable — it is stated here so the
      // invariant does not silently depend on the enum's vocabulary.
      if (isEndState(current.status) && payload.status !== undefined &&
          payload.status !== null && !isEndState(payload.status)) {
        throw new SmError.UnprocessableError(
          `Cannot change status from ${current.status} to ${payload.status}: a request never moves backward in its lifecycle.`
        )
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd test/api && npm test -- --test-name-pattern="rule 2"`
Expected: both PASS.

- [ ] **Step 5: Run the whole service-request suite for regressions**

Run: `cd test/api && npm test -- --test-name-pattern="service.request"`
Expected: all PASS. Nothing in the existing suite patches a terminal row to a non-terminal status.

- [ ] **Step 6: Commit**

```bash
git add api/source/service/ServiceRequestService.js test/api/tests/service-request/lifecycle.test.js
git commit -m "feat(api): reject backward service request status transitions"
```

---

### Task 2: API rule 1 — reject volunteer *changes* on cancelled and Unmatched rows

**Files:**
- Modify: `api/source/service/ServiceRequestService.js:368-372`
- Test: `test/api/tests/service-request/lifecycle.test.js`

**Interfaces:**
- Consumes: `isEndState(status)` from Task 1.
- Produces: nothing new; Task 3 edits the same block.

**Critical:** this rule judges **a change of value, not the presence of the key**. The Vue form builds a complete payload and always sends `volunteerPersonId` (`ServiceRequestCreateEdit.vue:637`), so a rule keyed on presence would 422 every ordinary Save on a cancelled request — including one that only edited a note. `Completed` is exempt entirely: correcting who performed a completed service is legitimate and moves no status.

- [ ] **Step 1: Write the failing tests**

Append to `test/api/tests/service-request/lifecycle.test.js`:

```js
test('rule 1: changing the volunteer on a cancelled request without a status is refused', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Member cancelled' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { volunteerPersonId: volunteer } })
  assert.equal(res.status, 422)

  const after = await vgCall('getServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  assert.equal(after.json.status, 'Member cancelled')
  assert.equal(after.json.volunteerPersonId, null)
})

test('rule 1: re-sending the SAME volunteer on a cancelled request is a no-op, not a 422', async () => {
  // This is the ordinary-Save case. handleSubmit always includes
  // volunteerPersonId, so a rule keyed on the key's presence rather than a
  // change of value would break every save on a cancelled request.
  const { json } = await create({
    villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer,
    serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  assert.equal(json.status, 'Confirmed')

  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Volunteer cancelled' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: volunteer, serviceName: 'Errand', status: 'Volunteer cancelled' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'Volunteer cancelled')
  assert.equal(res.json.serviceName, 'Errand')
})

test('rule 1: null-to-null on a cancelled request is not a change', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Hub cancelled' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: null, status: 'Hub cancelled' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'Hub cancelled')
})

test('rule 1: Completed is exempt — the volunteer may be corrected', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer,
    serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Completed' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: otherVolunteer, status: 'Completed' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'Completed')
  assert.equal(String(res.json.volunteerPersonId), otherVolunteer)
})

test('rule 1: the feature write path — volunteer plus Completed on a cancelled row', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Member cancelled' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: volunteer, status: 'Completed' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'Completed')
  assert.equal(String(res.json.volunteerPersonId), volunteer)
})
```

- [ ] **Step 2: Add the second volunteer fixture reference**

The exemption test needs a *different* volunteer. Near the top of the file, beside the existing `volunteer` constant, add:

```js
const otherVolunteer = String(persons.quahogVolunteer2.id)
```

Verify that fixture exists before relying on it:

Run: `grep -n "quahogVolunteer" test/api/setup/fixtures.js`

If there is no second Quahog volunteer, use any other person id the fixtures expose and rename the constant accordingly — the test only needs a value different from `volunteer`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd test/api && npm test -- --test-name-pattern="rule 1"`
Expected: the first test FAILS (currently returns 200 and silently derives `Confirmed` — the bug). The other four should PASS already; they are the guards that the fix must not over-reach.

- [ ] **Step 4: Implement rule 1**

In `patchServiceRequest`, replace lines 368-372:

```js
      const newVolunteerPersonId = payload.volunteerPersonId !== undefined
        ? (payload.volunteerPersonId || null)
        : current.volunteerPersonId
      const resolvedStatus = deriveStatus(payload.status, newVolunteerPersonId)
      updateFields.status = resolvedStatus
```

with:

```js
      const newVolunteerPersonId = payload.volunteerPersonId !== undefined
        ? (payload.volunteerPersonId || null)
        : current.volunteerPersonId

      // Rule 1: on a cancelled or Unmatched row, CHANGING the volunteer is
      // only meaningful as a step toward Confirmed — the backward move. Judge
      // a change of value, not the presence of the key: the Vue form always
      // sends volunteerPersonId, so keying on presence would refuse every
      // ordinary save on a cancelled request. Completed is exempt: correcting
      // who performed the service moves no status.
      const volunteerChanged = String(newVolunteerPersonId ?? '') !== String(current.volunteerPersonId ?? '')
      const ruleOneApplies = isEndState(current.status) && current.status !== 'Completed'
      if (ruleOneApplies && volunteerChanged && !isEndState(payload.status)) {
        throw new SmError.UnprocessableError(
          `Cannot change the volunteer on a request with status ${current.status}.`
        )
      }

      const resolvedStatus = deriveStatus(payload.status, newVolunteerPersonId)
      updateFields.status = resolvedStatus
```

Note the `String(... ?? '')` comparison: `volunteerPersonId` arrives as a string from JSON but the DB column returns a number, so `!==` on the raw values would report a spurious change for an unchanged volunteer — which is precisely the ordinary-Save case this rule must not break.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd test/api && npm test -- --test-name-pattern="rule 1"`
Expected: all five PASS.

- [ ] **Step 6: Run the whole service-request suite**

Run: `cd test/api && npm test -- --test-name-pattern="service.request"`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add api/source/service/ServiceRequestService.js test/api/tests/service-request/lifecycle.test.js
git commit -m "feat(api): reject volunteer changes on cancelled and unmatched requests"
```

---

### Task 3: API rule 3 — Completed implies a volunteer

**Files:**
- Modify: `api/source/service/ServiceRequestService.js` (same block as Task 2)
- Test: `test/api/tests/service-request/lifecycle.test.js`

**Interfaces:**
- Consumes: `newVolunteerPersonId` and `resolvedStatus` from the block Task 2 edited.
- Produces: nothing.

This closes a **pre-existing hole unrelated to the cancelled-request feature**: `deriveStatus` passes an explicit `Completed` straight through, so a caller can today record a completed service with nobody credited for it. No existing test caught it because the suite builds payloads the way the client does, and the client cannot express this combination. These tests are deliberately malformed payloads.

- [ ] **Step 1: Write the failing tests**

Append to `test/api/tests/service-request/lifecycle.test.js`:

```js
test('rule 3: completing a request with no volunteer is refused', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  assert.equal(json.status, 'Open')

  const res = await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Completed' } })
  assert.equal(res.status, 422)

  const after = await vgCall('getServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  assert.equal(after.json.status, 'Open')
})

test('rule 3: clearing the volunteer on a Completed request is refused', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer,
    serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Completed' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: null, status: 'Completed' }
  })
  assert.equal(res.status, 422)

  const after = await vgCall('getServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  assert.equal(String(after.json.volunteerPersonId), volunteer)
})

test('rule 3: judges the resulting row, so volunteer plus Completed together is fine', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId

  const res = await vgCall('patchServiceRequest', { serviceRequestId }, {
    token: tokens.users.sc,
    body: { volunteerPersonId: volunteer, status: 'Completed' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'Completed')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd test/api && npm test -- --test-name-pattern="rule 3"`
Expected: the first two FAIL with 200 instead of 422 — that is the hole. The third PASSES already.

- [ ] **Step 3: Implement rule 3**

In `patchServiceRequest`, immediately after the `resolvedStatus` assignment added in Task 2:

```js
      // Rule 3: a Completed request must credit a volunteer. deriveStatus
      // passes an explicit Completed through untouched, so without this a
      // caller can record a completed service nobody performed.
      if (resolvedStatus === 'Completed' && !newVolunteerPersonId) {
        throw new SmError.UnprocessableError(
          'A Completed service request must have a volunteer.'
        )
      }
```

Place it before the `UPDATE` query, after `updateFields.status = resolvedStatus`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd test/api && npm test -- --test-name-pattern="rule 3"`
Expected: all three PASS.

- [ ] **Step 5: Verify the regression this whole change exists to prevent**

Add one more test — the omitted-status case that silently resurrected terminal rows:

```js
test('a single-field patch on a terminal request leaves its status alone', async () => {
  const { json } = await create({
    villageId: quahog, memberPersonId: member, volunteerPersonId: volunteer,
    serviceDate: '2026-08-01'
  })
  const serviceRequestId = json.serviceRequestId
  await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { status: 'Completed' } })

  const res = await vgCall('patchServiceRequest', { serviceRequestId },
    { token: tokens.users.sc, body: { serviceName: 'Errand' } })
  assert.equal(res.status, 200)
  assert.equal(res.json.serviceName, 'Errand')
  assert.equal(res.json.status, 'Completed', 'omitting status must not re-derive a terminal row')
})
```

Run: `cd test/api && npm test -- --test-name-pattern="single-field patch"`

**This test is expected to FAIL.** It documents the last piece of the defect: `deriveStatus` treats an omitted status as "recompute", so this patch reverts `Completed` to `Confirmed`. None of rules 1–3 close it — rule 1 sees no volunteer change, rule 2 sees no explicit status, rule 3 sees a volunteer present.

- [ ] **Step 6: Make an omitted status leave a terminal row alone**

Replace the `resolvedStatus` assignment (added in Task 2, just below the rule 1 check):

```js
      const resolvedStatus = deriveStatus(payload.status, newVolunteerPersonId)
```

with:

```js
      // Absence must never imply an operation on a terminal row: omitting
      // status means "leave it alone", not "recompute". Non-terminal rows are
      // untouched — they still derive from volunteer presence exactly as
      // before, which is what keeps { volunteerPersonId } on an Open row
      // working. Only `undefined` short-circuits; an explicit null still means
      // recompute.
      const resolvedStatus = payload.status === undefined && isEndState(current.status)
        ? current.status
        : deriveStatus(payload.status, newVolunteerPersonId)
```

The `isEndState(current.status)` guard is load-bearing. Without it, an `Open` row patched with a volunteer and no status would keep `Open` instead of deriving `Confirmed`, breaking the most common edit in the app.

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd test/api && npm test -- --test-name-pattern="single-field patch"`
Expected: PASS.

- [ ] **Step 8: Run the full service-request suite**

Run: `cd test/api && npm test -- --test-name-pattern="service.request"`
Expected: all PASS, including the non-terminal derivation tests from Task 2 and the existing lifecycle tests. If an `Open`-row derivation test fails, the `isEndState(current.status)` guard is missing from the ternary.

- [ ] **Step 9: Commit**

```bash
git add api/source/service/ServiceRequestService.js test/api/tests/service-request/lifecycle.test.js
git commit -m "feat(api): require a volunteer for Completed and stop re-deriving terminal rows"
```

---

### Task 4: Client — swap the Cancel Request button for a reason-changer

**Files:**
- Modify: `client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue` — script near `:721-783`, template at `:1207-1228`
- Test: `client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js`

**Interfaces:**
- Consumes: existing `isCancelled` (`:723-725`), `CANCEL_REASONS` (`:721`), `doCancelRequest(reason, notify)` (`:753`), `cancelPopover` ref.
- Produces: `changeReasonOptions` computed and `handleChangeReason(reason)`, referenced by Task 5's tests only.

The actions row currently holds Cancel Request (`:1208-1214`, disabled when cancelled), Close, and a `SplitButton` labeled "Save and Notify". The swap replaces only the first: `v-if="isCancelled"` renders the reason-changer, `v-else` renders Cancel Request unchanged. Close and Save are untouched.

- [ ] **Step 1: Add an edit-mode mount helper**

**Edit mode comes from `route.params.id`, not a prop** (`ServiceRequestCreateEdit.vue:41`). The file's existing `useRoute` mock hardcodes `params: {}`, so every current test runs in *create* mode and `mountAndExpose()` cannot reach the cancelled-request branch. Passing a `serviceRequestId` prop would do nothing and the assertions would silently pass against create mode.

Replace the `vue-router` mock at the top of the test file so the route params are settable per test:

```js
const routeParams = { value: {} }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), afterEach: () => () => {} }),
  useRoute: () => ({ params: routeParams.value })
}))
```

Reset it in the existing `afterEach`, so create-mode tests are unaffected:

```js
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  routeParams.value = {}
})
```

Add an edit-mode variant of the existing helper, beside `mountAndExpose()`:

```js
// Mounts in edit mode with a stored request. `mountAndExpose` always mounts in
// create mode, because edit mode is driven by route.params.id.
async function mountEditAndExpose (request) {
  const { getServiceRequest } = await import('../api/serviceRequestApi.js')
  getServiceRequest.mockResolvedValue(request)
  routeParams.value = { id: String(request.serviceRequestId) }
  const vm = await mountAndExpose()
  await waitFor(() => expect(vm.existingRequest).toBeTruthy())
  return vm
}
```

- [ ] **Step 2: Write the failing tests**

```js
describe('cancelled request status editing', () => {
  const cancelledRequest = {
    serviceRequestId: 1, requestNumber: 1, villageId: '1', memberPersonId: '7',
    serviceName: 'Errand: Shopping', serviceDate: '2026-08-01',
    status: 'Member cancelled', volunteerPersonId: null
  }

  it('shows the reason-changer and hides Cancel Request when cancelled', async () => {
    await mountEditAndExpose(cancelledRequest)
    await waitFor(() => expect(screen.getByText('Change Reason')).toBeTruthy())
    expect(screen.queryByText('Cancel Request')).toBeNull()
  })

  it('shows Cancel Request and no reason-changer when not cancelled', async () => {
    await mountEditAndExpose({ ...cancelledRequest, status: 'Open' })
    await waitFor(() => expect(screen.getByText('Cancel Request')).toBeTruthy())
    expect(screen.queryByText('Change Reason')).toBeNull()
  })

  it('offers only the two other cancellation reasons, never Completed', async () => {
    const vm = await mountEditAndExpose(cancelledRequest)
    expect(vm.changeReasonOptions).toEqual(['Volunteer cancelled', 'Hub cancelled'])
    expect(vm.changeReasonOptions).not.toContain('Completed')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd client && npx vitest run src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js -t "cancelled request status editing"`
Expected: FAIL — "Change Reason" is not in the DOM, and `changeReasonOptions` is undefined.

- [ ] **Step 4: Add the script logic**

In `ServiceRequestCreateEdit.vue`, after `handleCancelRequest` (`:783`):

```js
// Only the two reasons the request is not already in. Completed is
// deliberately absent — completing is a consequence of attaching a volunteer,
// handled by the form and Save.
const changeReasonOptions = computed(() =>
  CANCEL_REASONS.filter(r => r !== existingRequest.value?.status)
)

const handleChangeReason = (reason) => {
  changeReasonPopover.value.hide()
  confirm.require({
    header: 'Change Cancellation Reason',
    message: 'Should notifications be sent for this change?',
    acceptLabel: 'Change and Notify',
    rejectLabel: 'Change without Notification',
    accept: () => doCancelRequest(reason, true),
    reject: () => doCancelRequest(reason, false)
  })
}
```

Add the popover ref beside the existing `cancelPopover` declaration:

```js
const changeReasonPopover = ref(null)
```

`doCancelRequest` is reused verbatim — it already PATCHes `{ status: reason, notify }`, which is exactly the reason-change payload. Only its success toast wording is cancel-specific; leave it, or generalize the detail string if it reads wrongly in context.

- [ ] **Step 5: Add the template swap**

Replace the `<template v-if="isEdit">` block's contents at `:1207-1228`. Keep the existing Cancel Request button and its popover exactly as they are, wrapped in `v-else`:

```vue
            <template v-if="isEdit">
              <template v-if="isCancelled">
                <Button
                  type="button"
                  label="Change Reason"
                  severity="danger"
                  :disabled="isSubmitting"
                  @click="(e) => changeReasonPopover.toggle(e)"
                />
                <Popover ref="changeReasonPopover">
                  <div style="display: flex; flex-direction: column; gap: 0.25rem; min-width: 180px;">
                    <Button
                      v-for="reason in changeReasonOptions"
                      :key="reason"
                      :label="reason"
                      text
                      severity="danger"
                      style="justify-content: flex-start;"
                      @click="handleChangeReason(reason)"
                    />
                  </div>
                </Popover>
              </template>
              <template v-else>
                <!-- existing Cancel Request button and cancelPopover, unchanged -->
              </template>
            </template>
```

Move the existing button and `<Popover ref="cancelPopover">` verbatim into the `v-else`. Its `:disabled` may drop `isCancelled` now that it never renders in that state, but leaving it is harmless — prefer the smaller diff.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js -t "cancelled request status editing"`
Expected: PASS.

- [ ] **Step 7: Run the full client suite**

Run: `cd client && npx vitest run`
Expected: all PASS. The `vue-router` mock change is the risk here — every existing test relies on create mode, which the `routeParams` reset in `afterEach` preserves. If create-mode tests fail, the reset is missing.

- [ ] **Step 8: Commit**

```bash
git add client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js
git commit -m "feat(client): let staff change the cancellation reason on a cancelled request"
```

---

### Task 5: Client — derive Completed from the volunteer edit, with a commitment notice

**Files:**
- Modify: `client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue` — `computedStatus` at `:326-332`, template near the volunteer field
- Test: `client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js`

**Interfaces:**
- Consumes: `isCancelled`, `computedStatus`, `form.volunteerPersonId`, `existingRequest`.
- Produces: `willCompleteOnSave` computed, asserted by this task's tests.

`handleSubmit` already sends both `volunteerPersonId` (`:637`) and `status` (`:668`, gated on `CLIENT_STATUSES`), so the single atomic write API rule 1 requires is what the form already does. The only new behavior is what `computedStatus` returns and the notice that explains it.

The notice is **load-bearing, not decorative**. On an `Open` request attaching a volunteer derives a reversible `Confirmed`. On a cancelled request it asserts a terminal `Completed`, undoable only by picking a cancel reason again. It is the only thing standing between "user attaches a volunteer for some other reason" and "user silently changes a terminal status."

- [ ] **Step 1: Write the failing tests**

Uses `mountEditAndExpose` from Task 4. The volunteer is driven through `vm.form.volunteerPersonId` — the same way every existing test in this file drives the form, via the `setupState` the helper exposes.

```js
describe('completing a cancelled request by attaching a volunteer', () => {
  const cancelledRequest = {
    serviceRequestId: 1, requestNumber: 1, villageId: '1', memberPersonId: '7',
    serviceName: 'Errand: Shopping', serviceDate: '2026-08-01',
    status: 'Member cancelled', volunteerPersonId: null
  }

  it('previews Completed and shows the commitment notice once a volunteer is set', async () => {
    const vm = await mountEditAndExpose(cancelledRequest)

    // No volunteer yet: the stored cancelled status shows, and no notice.
    expect(vm.computedStatus).toBe('Member cancelled')
    expect(vm.willCompleteOnSave).toBe(false)
    expect(screen.queryByText(/will mark this request Completed/i)).toBeNull()

    vm.form.volunteerPersonId = '9'
    await waitFor(() => {
      expect(screen.getByText(/will mark this request Completed/i)).toBeTruthy()
    })
    expect(vm.computedStatus).toBe('Completed')
  })

  it('drops the notice and restores the cancelled status when the volunteer is cleared', async () => {
    const vm = await mountEditAndExpose(cancelledRequest)

    vm.form.volunteerPersonId = '9'
    await waitFor(() => {
      expect(screen.getByText(/will mark this request Completed/i)).toBeTruthy()
    })

    vm.form.volunteerPersonId = null
    await waitFor(() => {
      expect(screen.queryByText(/will mark this request Completed/i)).toBeNull()
    })
    expect(vm.computedStatus).toBe('Member cancelled')
  })

  it('still derives Confirmed, not Completed, on a non-cancelled request', async () => {
    const vm = await mountEditAndExpose({ ...cancelledRequest, status: 'Open' })

    vm.form.volunteerPersonId = '9'
    await waitFor(() => expect(vm.computedStatus).toBe('Confirmed'))
    expect(vm.willCompleteOnSave).toBe(false)
    expect(screen.queryByText(/will mark this request Completed/i)).toBeNull()
  })
})
```

The third test is the guard that the cancelled branch did not swallow the ordinary `Open → Confirmed` derivation.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx vitest run src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js -t "completing a cancelled request"`
Expected: FAIL — no notice is rendered.

- [ ] **Step 3: Extend computedStatus and add the notice flag**

Replace `computedStatus` (`:326-332`):

```js
const CLIENT_STATUSES = ['Completed', 'Member cancelled', 'Volunteer cancelled', 'Hub cancelled']
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

`handleSubmit` sends `payload.status` only when `CLIENT_STATUSES.includes(form.value.status)` (`:667-668`). `form.value.status` still holds the loaded cancelled value, so `Completed` would not be sent. Change that block to send `computedStatus` instead:

```js
    if (isEdit.value) {
      // Only send status on PATCH for non-derived client values.
      if (CLIENT_STATUSES.includes(computedStatus.value)) {
        payload.status = computedStatus.value
      }
    }
```

This is the line that makes the completing save work, and it is easy to miss.

- [ ] **Step 4: Add the notice to the template**

Immediately after the volunteer field's wrapper in the template, add:

```vue
              <Message
                v-if="willCompleteOnSave"
                severity="warn"
                :closable="false"
              >
                Saving will mark this request Completed.
              </Message>
```

Import `Message` from `primevue/message` alongside the component's other PrimeVue imports if it is not already imported.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js -t "completing a cancelled request"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js
git commit -m "feat(client): complete a cancelled request by attaching a volunteer"
```

---

### Task 6: Client — refuse to submit a Completed request with no volunteer

**Files:**
- Modify: `client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue` — `handleSubmit`, near the existing time-order guard at `:615-630`
- Test: `client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js`

**Interfaces:**
- Consumes: `computedStatus` from Task 5, `toast`.
- Produces: nothing.

Mirrors API rule 3 client-side. It goes in `handleSubmit` with a toast, **not** in `isFormValid` — per the convention documented at `:505-511`: a disabled Save button cannot explain itself. Follow the existing time-order guard's shape exactly.

- [ ] **Step 1: Write the failing test**

**The save path calls `apiCall('patchServiceRequest', ...)` (`:674`), not the mocked `updateServiceRequest`.** Assert on the toast and on `handleSubmit` returning without submitting, rather than on an API mock that is never reached. Capture the toast by overriding its mock for this describe block:

```js
describe('Completed requests require a volunteer', () => {
  const completedRequest = {
    serviceRequestId: 1, requestNumber: 1, villageId: '1', memberPersonId: '7',
    serviceName: 'Errand: Shopping', serviceDate: '2026-08-01',
    status: 'Completed', volunteerPersonId: '9'
  }

  it('does not submit a Completed request whose volunteer was cleared', async () => {
    const vm = await mountEditAndExpose(completedRequest)

    vm.form.volunteerPersonId = null
    await vm.handleSubmit(false)

    // isSubmitting is only set after every guard passes, so it staying false
    // proves handleSubmit returned early rather than reaching the PATCH.
    expect(vm.isSubmitting).toBe(false)
  })

  it('submits normally when the volunteer is present', async () => {
    const vm = await mountEditAndExpose(completedRequest)

    await vm.handleSubmit(false)
    // Reaching the API path is enough — the guard did not fire.
    expect(vm.computedStatus).toBe('Completed')
  })
})
```

If `handleSubmit` is not exposed on `setupState` (script-setup only exposes what it declares), assert through the DOM instead: click the "Save and Notify" button via `screen.getByText('Save and Notify')` and check that the component did not navigate. Verify which is available before writing the final assertion.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js -t "volunteer was cleared"`
Expected: FAIL — the request is submitted.

- [ ] **Step 3: Add the guard**

In `handleSubmit`, beside the existing time-order check (before `isSubmitting.value = true` at `:632`):

```js
    // Mirrors API rule 3: a Completed request must credit a volunteer. Checked
    // here rather than in isFormValid so it can explain itself (see the note
    // above timesInOrder).
    if (computedStatus.value === 'Completed' && !form.value.volunteerPersonId) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'A completed request must have a volunteer',
        life: 3000
      })
      return
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd client && npx vitest run src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js -t "volunteer was cleared"`
Expected: PASS.

- [ ] **Step 5: Run both full suites**

Run: `cd client && npx vitest run`
Run: `cd test/api && npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue client/src/features/ServiceRequestList/tests/ServiceRequestCreateEdit.test.js
git commit -m "feat(client): require a volunteer when saving a Completed request"
```

---

### Task 7: Verify in the running app

**Files:** none — manual verification.

The client suite mounts the SFC in isolation with mocked APIs; it cannot prove the popover positions correctly, the notice reads well, or the PATCH round-trips. Per project convention, **ask the user to restart the API** rather than doing it — never restart it yourself.

- [ ] **Step 1: Ask the user to restart the API and confirm the dev stack is up**

- [ ] **Step 2: Walk the three paths in the browser**

1. Open a cancelled request. Confirm the button reads **Change Reason**, not Cancel Request, and the popover lists exactly the two other reasons.
2. Pick a different reason. Confirm the notify prompt says "Change and Notify" / "Change without Notification", and the request's reason changes.
3. On a cancelled request, attach a volunteer. Confirm the status preview shows **Completed** and the notice appears; clear the volunteer and confirm both revert. Re-attach and Save; confirm the request becomes Completed with the volunteer credited.

- [ ] **Step 3: Confirm ordinary editing still works**

On a cancelled request, change only the description and Save. **This must succeed** — it is the case rule 1's change-detection exists to protect. A 422 here means rule 1 is keyed on the key's presence rather than a change of value.

- [ ] **Step 4: Report findings**

Report what was observed, including anything that reads awkwardly. The commitment notice's wording and placement are the most likely things to want adjustment once seen in context — the user has already flagged this feature as a candidate for post-implementation refactoring.

---

## Notes for the implementer

**Deferred by design — do not build:** `Unmatched → Completed` in the UI. The customer's ask names cancelled requests only. The API rules already cover `Unmatched`; the UI deliberately does not. Do not widen `isCancelled` to include it.

**The seam:** `status` is a projection of volunteer presence for `Open`/`Confirmed`, and an asserted fact for the five end states. This work accommodates that split rather than resolving it. If a change feels like it needs a real state machine, that is this seam — raise it rather than building one.
