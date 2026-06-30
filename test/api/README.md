# Village Green — API integration tests

Black-box integration tests for the Village Green API, focused on **authorization /
information-exposure** correctness (only the right users see the right data).

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

## Expecting red

Some tests assert secure behavior the code does **not yet** implement, so a clean run is
**not** all-green today. See [SECURITY-FINDINGS.md](./SECURITY-FINDINGS.md) — the red tests
document live cross-village exposure bugs and pass automatically once those are fixed.

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

Current coverage is **~43%** of `api/source` statements — by design, the suite targets the
authorization surface, not the whole API. Well-exercised: the service-request
controller/service (~73%) and the auth layer (~66%). Thin: `VillageService` (~17%),
`UserService` (~20%), `PersonService` (~40%) — consistent with the gaps below.

## Not yet covered (known gaps)

Deliberately scoped to authorization / information-exposure on a few resources. Notable gaps:

- **Endpoints:** members, volunteers (capabilities/vetting), friends, users / user-groups /
  grant management, village CRUD + grant management, person & service-request create/delete
  beyond the lifecycle happy path, analytics, jobs, `op/*` (config/appdata/ce-dump/SSE).
- **Meta roll-up:** service-requests only; persons/friends meta not covered.
- **Scope matrix:** scope enforcement is exercised on service-requests as a representative,
  not asserted per-endpoint across every resource.
- **Roles:** the `roleId` tiers (1=restricted … 4=owner) aren't differentiated — whether
  `restricted` limits visibility/actions vs `full` is untested.
- **Group grants:** only direct user grants are seeded; grants via `user_group` are untested.
- **Notifications:** only the create `open` event; confirmed/cancelled/reminder, patch
  notifications, recipients, and the notification-history endpoints are untested.
- **CE member/volunteer fields & active views:** the new fields and `active_member` /
  `active_volunteer` filtering (e.g. inactive members hidden) aren't asserted.
- **Validation / negative cases:** request-body 400s, pagination, projections beyond
  `memberAddress`.
- **State gate:** the 503-until-`available` behavior is only implicitly exercised by the
  startup readiness probe.
- **Client / UI:** out of scope.

(The 7 red tests are known *bugs*, not coverage gaps — see SECURITY-FINDINGS.md.)

## Layout

```
run.js               orchestrator (entry point for `npm test`)
docker-compose.yml   throwaway MySQL 8
setup/
  env.js             ports, DB, paths (override via VG_TEST_* env vars)
  fixtures.js        canonical villages / users / grants / persons / service requests
  seed.js            inserts fixtures into the scaffolded schema
  tokens.js          mints per-user + special (expired/bad/insecure/scope) tokens
lib/
  client.js          vgFetch(path, {token, query, body, method})
  context.js         loads .tokens.json -> { tokens }
  db.js              withDb() for assertions on rows the API doesn't expose
auth/                authentication + scope, elevation
service-request/     meta roll-up, cross-village authz, lifecycle/correctness
persons/             cross-village person/address exposure
smoke/               state + spec endpoints
```

## Adding tests

Import the helpers and fixtures; key tests off the stable `role` handles:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../lib/client.js'
import { tokens } from '../lib/context.js'
import { serviceRequests as sr } from '../setup/fixtures.js'

test('full_v1 cannot read an Innsmouth service request by id', async () => {
  const { status } = await vgFetch(`/service-requests/${sr.srV2.id}`, { token: tokens.users.full_v1 })
  assert.equal(status, 404)
})
```
