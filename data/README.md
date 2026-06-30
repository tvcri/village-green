# Village Green — demo dataset generator

Deterministic demo data for Village Green: 296 RI-history/lore figures, 116 gag service requests, spread across 10 villages. The dataset is fixed-seed so the same records load every time.

## Prerequisites

- **Docker** — for the dev MySQL instance
- **Node.js 18+**
- **npm install** — run once inside this directory (`data/`)

The dev database schema must be present. The easiest way to get it is to start the API once (`docker compose -f ../docker-compose.dev.yml up -d` + whatever `npm run dev` script the API uses to apply migrations). See KNOWN ISSUE below about two missing views.

## Quick start

```bash
# From the repo root — bring up the dev MySQL container
docker compose -f docker-compose.dev.yml up -d

# From data/
npm install
npm run seed
```

That's it. The SQL seeder writes directly to MySQL and does not need the API running.

## Commands

| Command | What it does |
|---|---|
| `npm run seed` | Direct-SQL seed into the DB (primary path; always works) |
| `npm run emit` | Write `demo-appdata.jsonl` in the app-data format (needs the DB up for column introspection) |
| `npm run import` | POST the JSONL to `/op/appdata` (needs the API + mock OIDC, see below) |
| `npm run roundtrip` | seed → emit → import → sanity check |

### Environment knobs

| Variable | Default | Purpose |
|---|---|---|
| `VG_DB_HOST` | `127.0.0.1` | MySQL host |
| `VG_DB_PORT` | `3308` | MySQL port |
| `VG_DB_USER` | `vg` | MySQL user |
| `VG_DB_PASSWORD` | `vg` | MySQL password |
| `VG_DB_SCHEMA` | `vg` | MySQL schema/database |
| `VG_DEMO_API_BASE` | `http://localhost:54000` | Village Green API base URL |
| `VG_DEMO_OIDC_BASE` | `http://localhost:18080` | Mock OIDC base URL |
| `VG_DEMO_SEED` | `20260630` | RNG seed (change to get a different but still deterministic dataset) |
| `VG_DEMO_TOKEN` | _(unset)_ | Pre-minted bearer token (skips token mint from mock OIDC) |

## App-data path (`emit` / `import` / `roundtrip`)

The `import` and `roundtrip` commands use the app's `/op/appdata` endpoint. This endpoint:

- Is **opt-in** — the API must be started with `VG_EXPERIMENTAL_APPDATA=true`
- Requires the **mock OIDC** service on `:18080` — the loader mints a bearer token by sending a **GET** to `/api/get-token` with the admin username; the dataset is then **POSTed** to `/op/appdata`
- The loader token uses the narrow scope `vg:op` (sufficient for `/op/appdata`)

> **Note:** When logging in via the mock-OIDC browser form to use the app itself, enter the wider scope string into the form:
> `vg:op vg:village vg:person vg:service-request vg:member vg:volunteer vg:user vg:friends:read`

This path exercises the otherwise-untested `/op/appdata` endpoint and **may surface endpoint bugs**. The SQL `seed` command is the always-works fallback and is recommended for most development use.

## KNOWN ISSUE — two SQL views are missing from this branch

The app exposes members and volunteers through two SQL views (`active_member` and `active_volunteer`). Those views are **not in this branch's fresh-install schema** (the fix lives in `30-vg-views.sql` on a separate branch). Without them the app's `/persons` endpoint will **500** even though the demo data is correctly loaded in the DB.

Fix — run the following against the dev DB once (substitute your connection details):

```sql
CREATE OR REPLACE VIEW active_member AS SELECT * FROM member WHERE status = 'Active';
CREATE OR REPLACE VIEW active_volunteer AS SELECT * FROM volunteer WHERE active = 1;
```

Example one-liner using the dev defaults:

```bash
mysql -h 127.0.0.1 -P 3308 -u vg -pvg vg -e \
  "CREATE OR REPLACE VIEW active_member AS SELECT * FROM member WHERE status = 'Active'; \
   CREATE OR REPLACE VIEW active_volunteer AS SELECT * FROM volunteer WHERE active = 1;"
```

## Demo personas and mock-OIDC logins

When using the mock OIDC login form, enter one of the usernames below. Leave the password field blank (or use whatever the mock OIDC accepts). Use the scope string:

```
vg:op vg:village vg:person vg:service-request vg:member vg:volunteer vg:user vg:friends:read
```

| Username | Village | Role / notes |
|---|---|---|
| `samuel.slater@millworks.test` | — | **Admin** privilege (realm role `admin`), no village grants — sees all villages via elevate |
| `roger.williams@providence.test` | Arkham | Owner |
| `hp.lovecraft@miskatonic.test` | Arkham | Full |
| `peter.griffin@quahog.test` | Quahog | Owner |
| `john.brown@brownbros.test` | Quahog + Innsmouth + Arkham | Full ×3 — exercises the **meta roll-up** (3+ villages) |
| `nathanael.greene@newport.test` | Newport | Manage |
| `gilbert.stuart@gmail.test` | Quahog | Restricted |
| `ann.franklin@providence.test` | Providence | Full (steward) |
| `ida.lewis@lighthouse.test` | Newport | Full (steward) |
| `obed.marsh@innsmouth.test` | Innsmouth | Full (steward) |
| `richard.pickman@kingsport.test` | Kingsport | Full (steward) |
| `wilbur.whateley@dunwich.test` | Dunwich | Full (steward) |
| `betty.bett@chepachet.test` | Chepachet | Full (steward) |
| `abraham.whipple@pawtuxet.test` | Pawtuxet | Full (steward) |
| `roger.mowry@cabinet.test` | Cabinet, RI | Full (steward) |
| `mr.calimari@quahog.test` | — | No grants — valid login, sees nothing |

## Determinism

The dataset is fully deterministic. The RNG seed defaults to `20260630` (`VG_DEMO_SEED`). Every run with the same seed produces the same 296 persons, 116 service request gags, households, memberships, and notification records. Change `VG_DEMO_SEED` to generate a different (but equally deterministic) dataset.

The cameos are real Rhode Island historical figures and Lovecraft-lore characters, with gag service requests written to match their biographies.
