# Village Green — demo dataset generator

Deterministic demo data for Village Green: a roster of 316 RI-history/lore figures (116 of them gag cameos with bespoke service requests, plus a handful of invented descendants of real notables to fill out the rolls), spread across 10 villages. The dataset is fixed-seed so the same records load every time.

## Prerequisites

- **A running dev MySQL with the schema applied** — the generator doesn't start anything itself; it just connects to whatever the `VG_DB_*` env vars point at (defaults below). The easiest way to get the schema is to start the API once (it applies migrations at startup). See KNOWN ISSUE below about two missing views.
- **Node.js 18+**
- **npm install** — run once inside this directory (`data/`)

## Quick start

```bash
# Optional — a docker-compose for the dev MySQL container (not in the repo yet).
# Skip it if you already have the dev DB up; the generator just reads the
# VG_DB_* / VG_DEMO_* env vars and talks to whatever is already running.
docker compose -f docker-compose.dev.yml up -d

# From data/
npm install
npm run seed
```

That's it. The SQL seeder writes directly to MySQL and does not need the API running. The **app-data commands** (`seed:api` / `import` / `export` / `roundtrip`) are the exception: they go through the app's `/op/appdata` endpoint, so they need the API up (started with `VG_EXPERIMENTAL_APPDATA=true`) — and the mock OIDC server too, to mint the loader's token (unless you supply one via `VG_DEMO_TOKEN`). Details in the App-data path section below.

## Commands

The commands split into two families: **seed** commands *generate* the dataset and load it (via one of two routes), while **import/export** move *existing files* through the app's endpoints without generating anything.

| Command | Direction | What it does |
|---|---|---|
| `npm run seed:db` (alias: `seed`) | generate → DB | Generate the dataset and load it with direct SQL INSERTs (primary path; no API needed) |
| `npm run seed:api` | generate → app | Generate the same dataset and load it through the app's **import** endpoint (`POST /op/appdata`; needs the API + mock OIDC, see below) |
| `npm run emit` | generate → file | Generate the dataset and write it to `demo-appdata.jsonl` **without loading it anywhere**. Deterministic: the meta `date` is pinned so the same seed yields a byte-identical file (don't expect a fresh timestamp) |
| `npm run import` | file → app | POST an **existing** app-data file as-is (deflsault `demo-appdata.jsonl`; pick another with `npm run import -- --import=<file>`). Works with emitted files *and* app exports — no generation, and no doctor gate, so it can restore a backup even while the builders are mid-drift |
| `npm run export` | app → file | Call the app's **export** endpoint (`GET /op/appdata?format=jsonl`) and write `appdata-export.jsonl` — whatever is in the DB *right now*, serialized by the app itself (real timestamped meta, includes every table/column, not just what the generator sets) |
| `npm run roundtrip` | all of the above | seed:db → emit → seed:api → sanity check, exercising both load paths end to end |
| `npm run doctor` | — | Schema-drift check only (also runs automatically before every *generating* command above — not before `import`/`export`, which don't use the builders) |

**`emit` vs `export`** — both produce app-data JSONL, but from opposite ends: `emit` is the *generator's* serializer (what the dataset *should* be; reproducible, git-diffable), `export` is the *app's* serializer (what the DB actually *contains*, e.g. after clicking around the UI). Comparing an `export` taken right after a `seed:api` is a good way to catch bugs in the app's own export path.

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

## App-data path (`seed:api` / `import` / `export` / `roundtrip`)

The `seed:api`, `import`, `export`, and `roundtrip` commands use the app's `/op/appdata` endpoint (POST = import/overwrite, GET = export). This endpoint:

- Is **opt-in** — the API must be started with `VG_EXPERIMENTAL_APPDATA=true`
- Requires the **mock OIDC** service on `:18080` — the loader mints a bearer token by sending a **GET** to `/api/get-token` with the admin username, then POSTs (import) or GETs (export) `/op/appdata`
- The loader token uses the narrow scope `vg:op`. Scopes are **hierarchical** (prefix-matched), so `vg:op` also satisfies the export endpoint's `vg:op:read` — longer scopes are restrictions of their shorter parents

> **Note:** When logging in via the mock-OIDC browser form to use the app itself, enter the wider scope string into the form:
> `vg:op vg:village vg:person vg:service-request vg:member vg:volunteer vg:user vg:friends:read`

This path exercises the otherwise-untested `/op/appdata` endpoint and **may surface endpoint bugs**. The SQL `seed:db` command is the always-works fallback and is recommended for most development use.

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
| `admin` | all 10 | **Admin** privilege + **Owner** grant on every village (the mock-OIDC form's default username) |
| `samuel.slater@millworks.test` | — | **Admin** privilege (realm role `admin`), no village grants — sees all villages via elevate |
| `roger.williams@providence.test` | Arkham | Owner |
| `hp.lovecraft@miskatonic.test` | Arkham | Full |
| `peter.griffin@quahog.test` | Quahog | Owner |
| `john.brown@brownbros.test` | Quahog + Innsmouth + Arkham | Full ×3 — exercises the **meta roll-up** (3+ villages) |
| `nathanael.greene@newport.test` | Oldport | Manage |
| `gilbert.stuart@gmail.test` | Quahog | Restricted |
| `ann.franklin@providence.test` | New York System | Full (steward) |
| `ida.lewis@lighthouse.test` | Oldport | Full (steward) |
| `obed.marsh@innsmouth.test` | Innsmouth | Full (steward) |
| `richard.pickman@kingsport.test` | Kingsport | Full (steward) |
| `wilbur.whateley@dunwich.test` | Dunwich | Full (steward) |
| `betty.bett@chepachet.test` | Chipwhich | Full (steward) |
| `abraham.whipple@pawtuxet.test` | Pawstuxnet | Full (steward) |
| `roger.mowry@cabinet.test` | Cabinet | Full (steward) |
| `mr.calimari@quahog.test` | — | No grants — valid login, sees nothing |

Beyond these bespoke personas, a **coverage fill** pass tops up every village so it has at least one user of **each** grant role (Owner / Manage / Full / Restricted); the two big villages get 2–3 of each. Fill users are themed per village (`herbert.west@miskatonic.test`, `lois.griffin@quahog.test`, `alva.vanderbilt@newport.test`, `zadok.allen@innsmouth.test`, …) — see `FILL_LOGINS` in `generator/builders/villages.js` for the full roster. Any of them works as a mock-OIDC login. Every user carries a `name` claim in `lastClaims`, so creator attribution renders a display name rather than an email.

## Privacy rules and acknowledgements

The dataset publishes **one privacy-rules version** (a playground-flavored agreement, published and typo-fix-patched by `samuel.slater`) and an **acknowledgement for every user**, so no demo login ever hits the ack modal. This matters more than it looks: the API blocks nearly every endpoint (`privacy_ack_required`) for any user who hasn't acknowledged the current rules — only the spec, the rules text, the ack POST, and `/user` are reachable. Two consequences:

- Typing a **new** username into the mock OIDC form gets the ack modal on first login (realistic, and a handy way to demo the feature).
- Acknowledgements only count if they are **newer than `VG_PRIVACY_ACK_INTERVAL_DAYS`** (default 365). The seeded acks are dated April–May 2026, so around **spring 2027** they age out and every login starts modal-ing — re-seed, or publish a fresh rule in the Admin hub.

The loader's machine account (`demo-loader@villagegreen.test`) is pre-seeded **with** an acknowledgement for the same reason — otherwise the app would create it on the loader's first call and the ack gate would 403 the import/export commands themselves.

## How the dataset is built

Everything derives from three content files — `content/people.json` (the figure roster), `content/services.json` (the service catalog + member-note flavor), `content/destinations.json` (real RI places + the invented Miskatonic Health network) — fed through seeded-RNG builders in order: **villages + demo logins → privacy rule + acknowledgements → persons** (figures placed into villages by theme/hint) **→ membership** (member/volunteer rows in a ~60/40 mix; ~66% of members get a standing `serviceNotes`, ~40% a staff-only `confidentialNotes`, and every member carries `householdDues` ($0–60, usually $40); ~5% of each side is inactive, drawn from the invented-descendant filler persons first) **→ service requests + FCV submissions**.

Service requests are built in two passes:

1. **Gag pass** — each gag-tagged figure who landed as a member gets one bespoke request from their `gag` block in `people.json`. The free-text gag title is keyword-mapped onto a real UI service name, title + blurb become the `description`, and the gag's destination is used as-is.
2. **Volume pass** — each village gets ≈ 0.5 × its active-member count of ordinary bookings: a random active member × a weighted-random `catalog` entry (`Ride: Medical Appnt` ×6, other rides ×3 — prod is medical-ride-heavy) × a random destination from a pool matched to the service (medical → Miskatonic Health, shopping → grocery/food landmarks, personal care → the barber, activities → landmarks).

Any booking (gag or ordinary) can become a **standing request**: the same trip re-booked every 1/2/4 weeks for a handful of occurrences spanning past and future — past ones mostly Completed, upcoming ones Confirmed/Open, usually with the same regular volunteer, all sharing one entry timestamp and staff creator. Medical rides recur most (think dialysis runs); we're deliberately loose about what "recurs" — it's demo data, so Roger Williams may well draw a second banishment ride a month later.

Field rules mirror the client UI (`ServiceRequestCreateEdit.vue`): `serviceName` is always one of the ten `serviceNameOptions`; rides are `Round Trip` (~80%) or `One Way`, everything else `None`; Tech Support and Household Chores/Handy Help set no location fields, all others get destination/address/city/state; Round Trips carry `apptTime`/`returnTime` in Start → Arrival → Return → Finish slot order. A member's `serviceNotes` is echoed into `instructions` on every one of that member's requests, matching how prod repeats standing mobility notes. Members can hold several requests, but never two that overlap in time — the builder re-rolls the day/slot until it clears the member's other bookings. Every request's `createdUserId` points at a **manager or owner of its own village** (staff enter requests on behalf of members), so the app's creator attribution shows a plausible themed name.

## Maintaining the generator through schema changes

The schema is expected to change routinely. Two conventions keep those changes cheap:

- **Builders set only the columns they mean.** Both load paths (direct SQL and app-data) omit unset columns so DB defaults apply — the generator never has to chase columns it doesn't care about.
- **The doctor runs before every command** and compares what the builders emit against the live schema. Everything actionable is a hard **error** with the exact `table.column` named: a renamed/dropped column the builders still set, a new NOT-NULL-without-default column, or a **new unset column not yet acknowledged**. Every consciously-unset column lives in `generator/doctor-baseline.json` with a one-line reason — so when the schema grows a column, someone must either populate it in a builder (usually what we want, even for nullables) or record why not. Stale baseline entries (column since populated or dropped) surface as notices; prune them.

After merging schema changes from main: `npm test && npm run roundtrip` exercises the builders, the UI-rule invariants, the live schema, and the `/op/appdata` endpoint in one shot.

**Adding a new table**: add it to `TABLE_ORDER` in `generator/constants.js` (parent-before-child), build its rows in a builder, wire the builder into `generator/data.js`, and extend the `sanity()` counts in `generator/cli.js` plus a test.

## Determinism

The dataset is fully deterministic. The RNG seed defaults to `20260630` (`VG_DEMO_SEED`). Every run with the same seed produces the same 311 persons (~60/40 members:volunteers) and ~460 service requests — 101 bespoke gag bookings plus ordinary volume, with roughly 80 standing series among them — households, memberships, and notification records. Change `VG_DEMO_SEED` to generate a different (but equally deterministic) dataset.

The cameos are real Rhode Island historical figures and Lovecraft-lore characters, with gag service requests written to match their biographies.
