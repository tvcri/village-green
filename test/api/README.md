# Village Green — API integration tests

Black-box integration tests for the Village Green API. The suite spans the whole API
surface — every resource is **characterized** (its real current behavior pinned as a
regression net), with **authorization / information-exposure** correctness (only the right
users see the right data) as the throughline.

> **Status (2026-07-07):** re-synced with `main` after the #37–#47 merge (the person /
> member / volunteer schema rework): the seeder now targets the camelCase schema and
> seeds `firstName`/`lastName` (`fullName` is DB-generated as `"last, first"`), with a
> drift tripwire that names any out-of-sync column at seed time. Still pending: the
> member/volunteer lifecycle specs were written against a flat `/members` /
> `/volunteers/{id}` API that was never built — the implemented endpoints are
> `PUT|PATCH|DELETE /persons/{personId}/member` and `.../volunteer` — so those todo
> specs need retargeting before they can ever flip green. Coverage figures below marked
> *pre-merge* will be regenerated once that lands.

## How it works

`run.js` orchestrates a self-contained run with no changes to production code:

1. brings up a disposable **MySQL 8** (`docker-compose.yml`);
2. starts the existing **mock OIDC** provider (`../utils/mockOidc.js`) in-process;
3. spawns the **real API** (`node api/source/index.js`) pointed at the test DB + mock OIDC
   (it auto-scaffolds the schema), and waits for it to reach the `available` state;
4. **seeds** the canonical RI-themed fixtures (`setup/fixtures.js`, `setup/seed.js`);
5. **mints** a JWT per canonical user to `.tokens.json`;
6. runs the `*.test.js` files (Node's built-in `node:test`, hitting the API over HTTP);
7. tears everything down.

## Test framework

This suite uses Node's **built-in test runner** — [`node:test`](https://nodejs.org/api/test.html)
with `node:assert/strict` — **not** mocha/chai. It's been stable since Node 20, needs no
dependencies or config file, and runs via `node --test`. If you know mocha it maps almost
1:1: `describe`/`it`/`before`/`after` all exist (we mostly use flat `test()`), and
assertions are `node:assert` (`assert.equal`, `assert.deepEqual`, `assert.ok`) instead of
chai. The only test dependencies are `mysql2` (seeding) and `c8` (coverage).

## Running

Requires **Docker** (Compose v2) and **Node 18+** (developed on Node 24).

```bash
cd test/api
npm test           # full run (installs deps on first use)
npm run test:keep  # leave the MySQL container up for fast re-runs
npm run test:coverage  # same run, plus an api/source coverage report
```

## Test categories — green, red, and todo

A run is made of three kinds of test:

- **Green** — characterization: the resource's *real current behavior*, pinned so a
  regression turns it red. The bulk of the suite.
- **Red (hard fail)** — assertions of the *correct/secure* behavior on endpoints that are
  implemented but **buggy**. They fail on purpose and flip green when the bug is fixed, no
  edit needed. The red set is exactly the findings in
  [SECURITY-FINDINGS.md](./SECURITY-FINDINGS.md) — currently **10** (cross-village exposure
  on the service-request / person by-id paths, cross-village writes, and two double-wrapped
  multi-`villageId` 500s). Any *unexpected* red is a real regression.
- **Todo** — `node:test`'s `test.todo`: the *desired* behavior of endpoints **not built
  yet** (village writes are WIP). A failing todo does **not** fail the run, so the unbuilt
  surface is documented without drowning the regression signal; when the endpoint lands and
  the todo starts passing, drop the `todo` flag to promote it to a hard guard.
  *Caveat learned the hard way:* the member/volunteer todos were specced against a
  guessed flat-API design and `main` built person-scoped endpoints instead — todo specs
  should be written against an agreed OpenAPI change, not a predicted one.

So a "clean" run is the **10** documented reds, a stack of todos, and everything else green.
`npm test` exits non-zero only because of those 10 reds.

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

Coverage was **~54%** of `api/source` statements *pre-merge* (the figure predates
PRs #37–#47 and the seeding breakage; regenerate after the seed fix). At that point,
well-exercised: `PersonService` (~94%), `FriendService` (~85%), the service-request and
village controllers (~77-86%), and the auth layer. Thinner: `VillageService` (~65%),
`UserService` (~45%), and `OperationService` (~7% — the unexercised appdata/ce-dump/SSE
paths) / `JobService` (the `job` table isn't scaffolded in the test schema). The
Member/Volunteer controllers have since been implemented as person-scoped sub-resources
(`/persons/{personId}/member|volunteer`), which nothing exercises yet. Grant-management
writes are exercised against a disposable `scratch` village/user so the canonical fixtures
stay intact.

## Not yet covered (known gaps)

The suite spans every resource that existed at the last sync — auth/scope gating,
grant/role authorization, and characterization of real behavior, with WIP endpoints
specced as todos. Gaps, in priority order:

- **Member/volunteer writes (PRs #37/#44/#45):** the implemented
  `PUT|PATCH|DELETE /persons/{personId}/member` and `.../volunteer` endpoints are entirely
  untested; the existing lifecycle todos target the superseded flat `/members` /
  `/volunteers/{id}` design and must be retargeted.
- **Privacy (PR #31):** all four `/privacy/*` endpoints (rules read/publish/correct,
  acknowledgement) and the API-side acknowledgement enforcement are untested.
- **Admin user management (PRs #40/#41):** `POST /users`, `PATCH`/`PUT /users/{userId}`
  have no coverage; `DELETE /users/{userId}` and the grant writes have only non-admin-403
  checks. These endpoints call the Keycloak admin API, which mockOidc doesn't implement —
  for now, test the DB-side behavior via `?keycloak=false`; exercising the Keycloak
  integration itself (e.g. a minimal admin-API facade in mockOidc) is deferred pending
  discussion.
- **User groups:** all `/user-groups` endpoints are untested, and only direct user grants
  are seeded — grants via `user_group` are unverified.
- **Service-request cancel transition:** the PR #46 confirmation dialog is client-side, but
  the underlying `PATCH` cancel transition has no dedicated test.
- **Reference data:** `/communities`, `/disabilities`, `/capabilities`, `/vetting-types`
  have no smokes.
- **Notifications:** only the create `open` event; confirmed/cancelled/reminder, patch
  notifications, recipients, and the notification-history endpoints are untested.
- **CE member/volunteer fields & active views:** the new fields and `active_member` /
  `active_volunteer` filtering (e.g. inactive members hidden) aren't asserted.
- **Meta roll-up:** service-requests only; persons/friends meta not covered.
- **op/* internals:** `VG_EXPERIMENTAL_APPDATA` is ON in the harness; the JSONL
  export → import → re-export round trip is exercised (`tests/op/appdata-roundtrip.test.js`,
  helpers in `lib/appdata.js`). Still unexercised: gzip-format appdata, `ce-dump`, and the
  `state/sse` stream; `jobs` and `op/configuration` need their tables scaffolded in the
  test schema.
- **Validation / negative cases:** request-body 400s and pagination are only spot-checked.
- **Client / UI:** out of scope. (This includes the CSV exports from PRs #38/#39 — CSV is
  generated client-side from the tested JSON list endpoints; there is no API surface.)

(The 10 red tests are known *bugs*, not coverage gaps — see SECURITY-FINDINGS.md.)

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
  tokens.js          mints per-user + special (expired/bad/insecure/scope) tokens
lib/
  client.js          vgFetch(path, {token, query, body, method, rawBody, contentType})
  context.js         loads .tokens.json -> { tokens }
  db.js              withDb() for assertions on rows the API doesn't expose
  appdata.js         export/import/parse helpers for /op/appdata (JSONL); also
                     the hook for importing special-purpose datasets in tests
tests/               the endpoint tests, one directory per topic; each topic's
                     projections.test.js covers its `?projection=` expansions
  auth/              authentication + scope, elevation
  members/           authz/scope gating (green) + CRUD specs (todo — target the
                     superseded flat /members API; retarget to /persons/{id}/member)
  volunteers/        authz/scope gating (green) + CRUD/capabilities specs (todo —
                     same: retarget to /persons/{id}/volunteer)
  friends/           grant filtering, elevate, query filters (+ finding #4)
  persons/           cross-village read leak (#1) + cross-village writes (#5)
  service-request/   meta roll-up, cross-village authz, lifecycle/correctness
  villages/          read grant-gating, grant-mgmt authz (admin), WIP write todos
  users/             self-service + admin-gated user/grant/group management
  roles/             role-tier (non-)differentiation
  op/                appdata gating, analytics (admin), jobs (admin surface)
  smoke/             state + spec endpoints
```

## Adding tests

Add files under `tests/<topic>/`; import the helpers and fixtures and key tests off
the stable `role` handles:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { serviceRequests as sr } from '../../setup/fixtures.js'

test('full_v1 cannot read an Innsmouth service request by id', async () => {
  const { status } = await vgFetch(`/service-requests/${sr.srV2.id}`, { token: tokens.users.full_v1 })
  assert.equal(status, 404)
})
```
