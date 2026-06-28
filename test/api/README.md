# Village Green — API integration tests

Black-box integration tests for the Village Green API, focused on **authorization /
information-exposure** correctness (only the right users see the right data).

## How it works

`run.js` orchestrates a self-contained run with no changes to production code:

1. brings up a disposable **MySQL 8** (`docker-compose.yml`);
2. starts the existing **mock OIDC** provider (`../utils/mockOidc.js`) in-process;
3. spawns the **real API** (`node api/source/index.js`) pointed at the test DB + mock OIDC
   (it auto-scaffolds the schema), and waits for it to reach the `available` state;
4. **seeds** the canonical RI/Lovecraft fixtures (`setup/fixtures.js`, `setup/seed.js`);
5. **mints** a JWT per canonical user to `.tokens.json`;
6. runs the `*.test.js` files (Node's built-in `node:test`, hitting the API over HTTP);
7. tears everything down.

## Running

Requires **Docker** (Compose v2) and **Node 18+** (developed on Node 24).

```bash
cd test/api
npm test          # full run (installs deps on first use)
npm run test:keep # leave the MySQL container up for fast re-runs
```

## Expecting red

Some tests assert secure behavior the code does **not yet** implement, so a clean run is
**not** all-green today. See [SECURITY-FINDINGS.md](./SECURITY-FINDINGS.md) — the red tests
document live cross-village exposure bugs and pass automatically once those are fixed.

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
