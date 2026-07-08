# Village Green — API integration tests

Black-box integration tests for the Village Green API. The suite spans the whole API
surface — every resource is **characterized** (its real current behavior pinned as a
regression net), with **authorization / information-exposure** correctness (only the right
users see the right data) as the throughline.

> **Status (2026-07-07):** re-synced with `main` after the #37–#47 merge (the person /
> member / volunteer schema rework): the seeder targets the camelCase schema and seeds
> `firstName`/`lastName` (`fullName` is DB-generated as `"last, first"`), with a drift
> tripwire that names any out-of-sync column at seed time. The member/volunteer
> lifecycle specs have been **retargeted** onto the implemented person sub-resources
> (`PUT|PATCH|DELETE /persons/{personId}/member` and `.../volunteer`) and run green;
> the superseded flat-API todos are retired. New coverage: privacy rules +
> acknowledgement gate, admin user management (`?keycloak=false`), user groups +
> grants-via-group, SR cancel, and reference-data smokes.

## How it works

`run.js` orchestrates a self-contained run with no changes to production code:

1. brings up a disposable **MySQL 8** (`docker-compose.yml`);
2. starts the existing **mock OIDC** provider (`../utils/mockOidc.js`) in-process;
3. spawns the **real API** (`node api/source/index.js`) pointed at the test DB + mock OIDC
   (it auto-scaffolds the schema), and waits for it to reach the `available` state;
4. **seeds** the canonical RI-themed fixtures (`setup/fixtures.js`, `setup/seed.js`);
5. **mints** a JWT per canonical user to `.tokens.json`, and captures the API's served
   OAS definition (`GET /op/definition`) to `.definition.json` for the
   operationId-driven request helper (`lib/ops.js`);
6. runs the `*.test.js` files (Node's built-in `node:test`, hitting the API over HTTP);
7. tears everything down.

## Test framework

This suite uses Node's **built-in test runner** — [`node:test`](https://nodejs.org/api/test.html)
with `node:assert/strict` — **not** mocha/chai. It's been stable since Node 20, needs no
dependencies or config file, and runs via `node --test`. If you know mocha it maps almost
1:1: `describe`/`it`/`before`/`after` all exist (we mostly use flat `test()`), and
assertions are `node:assert` (`assert.equal`, `assert.deepEqual`, `assert.ok`) instead of
chai. The only test dependencies are `mysql2` (seeding), `c8` (coverage), and
`@trojs/openapi-dereference` (the spec-driven request helper — see below).

### Two request helpers: `vgFetch` and `vgCall`

- **`vgFetch(path, opts)`** (`lib/client.js`) — the raw HTTP helper: literal path,
  explicit method. Use it for **RED security probes** (pin the literal URL so a spec
  rename can't silently retarget a finding) and anything the spec can't express
  (wrong-method probes, raw JSONL bodies, hostile inputs).
- **`vgCall(operationId, params, opts)`** (`lib/ops.js`) — spec-driven: resolves the
  path and method from the OAS definition the API actually serves, with path + query
  params in a single object (`vgCall('getVillage', { villageId: 1, projection: ['owners'] },
  { token })`). This is the same operationId contract the Vue client consumes
  (`client/src/shared/api/apiClient.js`), built on **byte-identical vendored copies** of
  the client's `openApiOps.js`/`queryString.js` (`lib/vendor/`, sync enforced by
  `tests/smoke/vendor-sync.test.js`). Unlike the client's helper, `vgCall` **throws on
  params the operation doesn't declare** (the client silently drops them) — in a test, a
  typo'd param would silently weaken the assertion. Prefer it for green/characterization
  tests: a path rename on `main` follows the spec automatically, and a removed
  operationId fails loudly. `lib/ops.js` also exports the raw `ops` instance for spec
  introspection (`operationMap`, `getOperationIds()`, `getProjectedUrls()`) — see the
  projection drift tripwire in `tests/villages/projections.test.js`.

## Running

Requires **Docker** (Compose v2) and **Node 22+** — the runner uses a test-file
glob and `--test-concurrency`, which need Node ≥ 21 (developed on Node 24).

```bash
cd test/api
npm test           # full run (installs deps on first use)
npm run test:keep  # leave the MySQL container up for fast re-runs
npm run test:coverage  # same run, plus an api/source coverage report
npm run appdata    # NO tests: seed, export the fixtures to test-fixtures.appdata.jsonl, tear down
```

`npm run appdata` produces an appdata JSONL of the pristine canonical fixtures
(pass a path after `--` to write elsewhere: `npm run appdata -- ~/vg-fixtures.jsonl`).
Import it into a dev instance to click around the test data without the suite
mutating it, and re-import the same file to reset whatever you changed. Caveat:
an appdata import truncates and replaces every table in the file — including
`user_data`, so your dev login's row is replaced too (it's re-created on next
access, and admin rides on token privileges, not DB rows).

## Test categories — green, red, and todo

A run is made of three kinds of test:

- **Green** — characterization: the resource's *real current behavior*, pinned so a
  regression turns it red. The bulk of the suite.
- **Red (hard fail)** — assertions of the *correct/secure* behavior on endpoints that are
  implemented but **buggy**. They fail on purpose and flip green when the bug is fixed, no
  edit needed. The red set is exactly the findings in
  [SECURITY-FINDINGS.md](./SECURITY-FINDINGS.md) — currently **13** (cross-village exposure
  on the service-request / person by-id paths, cross-village writes — including the
  member/volunteer role sub-resources — two double-wrapped multi-`villageId` 500s, and
  the ungated village write endpoints). Any *unexpected* red is a real regression.
- **Todo** — `node:test`'s `test.todo`: the *desired* behavior of endpoints **not built
  yet** (village writes are WIP). A failing todo does **not** fail the run, so the unbuilt
  surface is documented without drowning the regression signal; when the endpoint lands and
  the todo starts passing, drop the `todo` flag to promote it to a hard guard.
  *Caveat learned the hard way:* the original member/volunteer todos were specced against
  a guessed flat-API design and `main` built person-scoped endpoints instead (they've
  since been retargeted) — todo specs should be written against an agreed OpenAPI change,
  not a predicted one.

So a "clean" run is the **13** documented reds, a stack of todos, and everything else green.
`npm test` exits non-zero only because of those 13 reds.

## Coverage

The API runs as a **separate process**, so coverage is collected from the server itself
(`NODE_V8_COVERAGE` on the API child) and reported with `c8` — `node --test`'s own coverage
would only see the test files, not the API.

```bash
npm run test:coverage
```

This prints a text summary and writes an HTML report to `test/api/.coverage/index.html`
(both gitignored), scoped to `api/source/**` — the code the API actually executes while
serving the tests. The report generates even on a red run.

Coverage is **~66%** of `api/source` statements (2026-07-07, post gap-closure).
Well-exercised: `MemberService` / `PrivacyService` (100%), `ServiceRequestService`
(~97%), `VolunteerService` (~94%), `PersonService` (~88%), `FriendService` (~85%),
`UserService` (~78%), and the auth layer. Thinner, with known causes: `VillageService`
(~69% — village writes are WIP todos), `OperationService` (~39% — ce-dump / SSE / gzip
appdata unexercised), `KeycloakService` (~33% — no admin API in mockOidc), `JobService`
(~32% — the `job` table isn't scaffolded), `ApplicationImportService` (~58%) and the
OAuth controller (client-facing flows, out of scope). Grant-management writes are
exercised against a disposable `scratch` village/user so the canonical fixtures stay
intact.

## Not yet covered (known gaps)

The suite spans every resource that existed at the last sync — auth/scope gating,
grant/role authorization, and characterization of real behavior, with WIP endpoints
specced as todos. Gaps, in priority order:

- **Keycloak-integrated user management:** the `?keycloak=false` paths are covered, but
  the Keycloak admin-API calls themselves are not (mockOidc has no admin API); a minimal
  admin-API facade in mockOidc is deferred pending discussion. Known holes documented as
  todos/comments in `tests/users/management.test.js`: only `POST /users` has a
  `keycloak=false` escape — `DELETE /users/{userId}` and a username-changing `PATCH`
  (via `KeycloakService.updateUsername`) call Keycloak unconditionally, so they 500 in
  the harness and their happy paths are untestable; and `PUT /users/{userId}` is
  unusable because `UserPut` both requires and forbids `villageGrants` (spec bug,
  characterized as 400).
- **Volunteer vettings:** the `vettings` arrays on the volunteer role are unexercised —
  `vetting_type` ships no static rows and has no write endpoint, so any `vettingTypeId`
  would violate the FK.
- **Notifications:** only the create `open` and cancel `cancelled` events; confirmed /
  reminder, patch notifications, recipients, and the notification-history endpoints are
  untested.
- **Meta roll-up:** service-requests only; persons/friends meta not covered.
- **op/* internals:** `VG_EXPERIMENTAL_APPDATA` is ON in the harness; the JSONL
  export → import → re-export round trip is exercised (`tests/op/appdata-roundtrip.test.js`,
  helpers in `lib/appdata.js`). Still unexercised: gzip-format appdata, `ce-dump`, and the
  `state/sse` stream; `jobs` and `op/configuration` need their tables scaffolded in the
  test schema.
- **Validation / negative cases:** request-body 400s and pagination are only spot-checked.
- **Client / UI:** out of scope. (This includes the CSV exports from PRs #38/#39 — CSV is
  generated client-side from the tested JSON list endpoints; there is no API surface.)

(The 13 red tests are known *bugs*, not coverage gaps — see SECURITY-FINDINGS.md.)

## Layout

```
run.js               orchestrator (entry point for `npm test`)
docker-compose.yml   throwaway MySQL 8
setup/
  env.js             ports, DB, paths (override via VG_TEST_* env vars)
  fixtures.js        canonical villages / users / grants / persons / members /
                     volunteers / service requests / FCV submissions
  seed.js            inserts fixtures into the scaffolded schema (with a
                     schema-drift tripwire that names any out-of-sync column)
  tokens.js          mints per-user + special (expired/bad/insecure/scope/
                     audience/issuer) tokens; aud enforcement is ON in the harness
lib/
  client.js          vgFetch(path, {token, query, body, method, rawBody, contentType})
  ops.js             vgCall(operationId, params, opts) — spec-driven requests, plus
                     the ops instance for spec introspection (loads .definition.json)
  vendor/            byte-identical copies of the Vue client's openApiOps.js /
                     queryString.js (sync enforced by tests/smoke/vendor-sync.test.js)
  context.js         loads .tokens.json -> { tokens }
  db.js              withDb() for assertions on rows the API doesn't expose
  appdata.js         export/import/parse helpers for /op/appdata (JSONL); also
                     the hook for importing special-purpose datasets in tests
tests/               the endpoint tests, one directory per topic; each topic's
                     projections.test.js covers its `?projection=` expansions
  auth/              authentication + scope, elevation
  members/           authz/scope gating + /persons/{id}/member lifecycle,
                     active_member view filtering (+ finding #5 probe)
  volunteers/        GET /volunteers grant-scoping + /persons/{id}/volunteer
                     lifecycle, capabilities, active_volunteer (+ #5 probe)
  friends/           grant filtering, elevate, query filters (+ finding #4)
  persons/           cross-village read leak (#1) + cross-village writes (#5)
  privacy/           rules lifecycle + the acknowledgement gate (order-sensitive:
                     ends by acking every canonical user for the files after it)
  reference/         /communities /disabilities /capabilities /vetting-types smokes
  service-request/   meta roll-up, cross-village authz, lifecycle incl. cancel
  villages/          read grant-gating, grant-mgmt authz (admin), WIP write todos
                     (+ finding #6: the write endpoints have no authz gate)
  users/             self-service + admin user/grant management (?keycloak=false)
                     + user groups & grants-via-group
  roles/             role-tier (non-)differentiation
  op/                appdata gating + round trip, analytics (admin), jobs
  smoke/             state + spec endpoints, vendored-module sync tripwire
```

## Adding tests

Add files under `tests/<topic>/`; import the helpers and fixtures and key tests off
the stable `role` handles. Prefer `vgCall` (operationId) for green tests, `vgFetch`
(literal path) for RED probes and off-spec requests:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { serviceRequests as sr } from '../../setup/fixtures.js'

test('full_v1 cannot read an Innsmouth service request by id', async () => {
  const { status } = await vgCall('getServiceRequest', { serviceRequestId: sr.srV2.id }, { token: tokens.users.full_v1 })
  assert.equal(status, 404)
})
```
