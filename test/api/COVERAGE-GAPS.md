# Known e2e coverage gaps

What this suite deliberately does **not** cover yet, why, and what closing each
gap would take. Companion to `SECURITY-FINDINGS.md` (which tracks *bugs*; this
tracks *blind spots*). Last reviewed 2026-07-21 @ merge `081200a` (post-#67/#68).

## 1. The VSS surface: `/volunteer-requests/**` (largest gap)

Untested end-to-end: the volunteer access gate, list scopes
(`open`/`mine`/`history`), the capability-prefix visibility boundary, sign-up
and release lifecycles, and the #68 multi-volunteer household outcomes
(`selectionRequired` 422, `alreadyOwnAccount` 409, posted-`personId`
validation, account-wide release).

**Why it's structural, not an oversight:** VSS access is identity-derived —
the caller's `username` must equal an active volunteer-person's `email`
(resolved at runtime through `active_volunteer`; see
`utils.js sqlResolvedPersonIds`). Every canonical fixture username
(`anne.hutchinson@quahog.test`, …) deliberately matches no person email
(`*.@residents.test`), so all canonical users have empty `personIds` and the
whole surface is invisible to them. Nothing here is exercised by accident.

**What exists instead:** upstream unit tests
(`api/source/test/volunteerRequestService.test.js`, `userServiceVss.test.js`,
`accessGates.test.js`) cover the pure decision logic — outcome classification,
capability-gate SQL shape, id-set escaping. The HTTP contract, the gates in
middleware order, and the atomic first-wins UPDATE are not covered anywhere.

**To close it:** add fixture user(s) whose username equals a volunteer
person's email — e.g. a `vssJoe` user with username
`joe.swanson@residents.test` (matches the seeded Quahog volunteer person), and
a second volunteer person sharing that same email to exercise the household
(multi-`personIds`) outcomes. Seed `volunteer_capability` rows so the
capability boundary is observable (one capability held, one not). Then the
interesting assertions are:

- gate: canonical (email-unmatched) users → 403 on every `/volunteer-requests`
  route; `vssJoe` → 200 even with **zero role grants** (the staff gate
  exempts `/volunteer-requests`; volunteer access is identity, not grants)
- `GET /user` → `volunteers[]` populated (the `[]` shape for canonical users
  is already pinned in `tests/users/self.test.js`)
- `scope=open` visibility limited by capability prefix; cross-village
  visibility is by design (any active volunteer sees any village's open
  requests)
- sign-up: 200 confirmed / 404 for capability-mismatched (no existence leak) /
  409 non-open / 422 `selectionRequired` for a 2-qualifier household with no
  posted `personId` / 403 for a posted `personId` outside the caller's set /
  409 `alreadyOwnAccount` naming the committed sibling
- release: account-wide (either household member can release), 409 otherwise;
  released row returns to `Open`
- cleanup discipline: sign-up/release mutate `service_request` — use throwaway
  SRs (created as `sc`), not the canonical fixtures

## 2. `/enrollment/**` (self-service account claim)

Untested end-to-end: request-PIN → verify → account-claim flow, attempt/reset
caps, supersede semantics, webhook notification bearer.

**Why:** the happy path terminates in Keycloak account creation
(`KeycloakService`), and the harness runs with no Keycloak. Upstream unit
tests (`enrollmentService/ResetCap/Supersede/sendPinWebhook.test.js`) cover
the pure logic (outcome classification, caps, bcrypt PIN store, supersede).

**Partially closable without Keycloak:** the `not_found` /
`ineligible_member` / `kc_unavailable` outcomes, the audit rows in
`enrollment_request`, and the notification_event payload rows are all
observable over HTTP with the DB alone — worth a small file if enrollment sees
real use. The full claim flow would need a mock Keycloak admin API in the
harness (a bigger lift; `run.js` would grow a fourth process).

## 3. Smaller known gaps

- **`GET /op/jobs` family** — todo-marked in `tests/op/jobs.test.js`: the
  `job` table is not in the scaffold schema, so `getJobs` 500s server-side.
  Blocked upstream; not a suite gap per se.
- **Person-move destination gate** — `patchPerson` re-checks `person:write`
  on the *destination* village when a body moves a person. Unreachable with
  current fixtures (no village-scoped role holds `person:write` anymore;
  staff/admin pass both gates), so the second gate is pinned by no test.
- **`resetEnrollmentPassword`** (admin+elevate) — ungated in the suite;
  belongs with gap 2.
- **Meta SR list filter params from #67** (date-range/VSS-signup filters on
  `getServiceRequests`) — additive query params, currently unexercised;
  cheap to fold into `tests/service-request/projections.test.js` or
  `meta-rollup.test.js` when they matter.

## Not gaps (deliberate scope)

- **Keycloak-backed user provisioning** (`createUser` with `keycloak=true`,
  `deleteUser`) — needs a real/mocked Keycloak; the `keycloak=false` paths are
  covered.
- **The Vue client** — this suite is API-only; client tests live under
  `client/src/**`.
- **Migration up/down mechanics** — the suite always runs at head schema; the
  drift tripwire in `setup/seed.js` names columns when main moves.
