# Known e2e coverage gaps

What this suite deliberately does **not** cover yet, why, and what closing each
gap would take. Companion to `SECURITY-FINDINGS.md` (which tracks *bugs*; this
tracks *blind spots*). Last reviewed 2026-07-21 @ merge `081200a` (post-#67/#68).

## 1. ~~The VSS surface: `/volunteer-requests/**`~~ — CLOSED

Closed by `tests/volunteer-requests/vss.test.js` (19 tests). What it took, since
the obstacle was structural rather than an oversight: VSS access is
identity-derived — the caller's `username` must equal an active
volunteer-person's `email` (resolved through `active_volunteer`; see
`utils.js sqlResolvedPersonIds`), and every canonical fixture username
(`*@quahog.test`, …) deliberately matches no person email (`*@residents.test`),
so the whole surface was invisible to every existing persona.

Three fixture additions opened it up:

- **`users.vssJoe`**, username `joe.swanson@residents.test` — the only fixture
  user whose username matches a person email, and it holds **zero role grants**
  (which is what pins the staff-gate exemption).
- **`persons.vssHouseholdSibling`** — a second "Joe Swanson" person in
  Innsmouth. `person()` derives email from the name, so it shares
  quahogVolunteer's email automatically and `vssJoe` resolves to **two** active
  volunteers: the #68 multi-volunteer household.
- **`volunteerCapabilities`** — `volunteer_capability` was never seeded, so
  before this every `scope=open` was empty and every sign-up 404'd. The
  household holds Rides and *not* Errands, which is what makes the capability
  boundary observable.

Two traps worth remembering, both guarded by `assertVssIdentity` in `seed.js`:
capability names map to serviceName **prefixes** with a colon (`Rides` →
`'Ride:'`), so the seeded `'Ride to pharmacy'` fixtures match *nothing* — VSS
tests create their own `'Ride: …'` requests; and a rename on either Joe Swanson
silently empties `personIds`, which looks exactly like an access bug.

It also surfaced a real defect: `VolunteerServiceRequest` is
`additionalProperties: false` but the service returns `requestNumber`, so every
VSS response violated the spec. Fixed by adding the property.

Left uncovered on purpose: `scope=history` contents (needs `Completed`
fixtures) and the capability-revocation read-back path.

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
