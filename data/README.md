# Village Green — demo dataset generator

Deterministic demo data for Village Green: RI-history/lore figures (a good share of them gag cameos with bespoke service requests, plus a handful of invented descendants of real notables to fill out the rolls), spread by default across all 10 villages. Most villages skew volunteer-heavy (~40/60 members:volunteers, the real-world norm); Quahog, Oldport, and Kingsport are flipped member-heavy (~60/40). The dataset is fixed-seed so the same records load every time — record counts scale with the sizing knobs below rather than being fixed numbers.

## Prerequisites

- **A running dev MySQL with the schema applied** — the generator doesn't start anything itself; it just connects to whatever the `VG_DB_*` env vars point at (defaults below). The easiest way to get the schema is to start the API once.
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
| `npm run import` | file → app | POST an **existing** app-data file as-is (default `demo-appdata.jsonl`; pick another with `npm run import -- --import=<file>`). Works with emitted files *and* app exports — no generation, and no doctor gate, so it can restore a backup even while the builders are mid-drift |
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
| `VG_DEMO_VILLAGES` | _(unset = all 10)_ | Which villages to build: a count (`3` → the first 3 villages in `constants.js`) or a comma-separated name list (`Arkham,Quahog`) |
| `VG_DEMO_MEMBERS` | _(unset = per-class mix)_ | Uniform member headcount for **every** selected village, overriding the default big/medium/small/tiny × mix split |
| `VG_DEMO_VOLUNTEERS` | _(unset = per-class mix)_ | Uniform volunteer headcount for **every** selected village, overriding the default split |

`VG_DEMO_MEMBERS`/`VG_DEMO_VOLUNTEERS` are both-or-neither in practice — setting one overrides that side per village while the other keeps the mix-based default, which is rarely what you want. A small, fast dataset for local UI work:

```bash
VG_DEMO_VILLAGES=3 VG_DEMO_MEMBERS=15 VG_DEMO_VOLUNTEERS=20 npm run seed
```

## App-data path (`seed:api` / `import` / `export` / `roundtrip`)

The `seed:api`, `import`, `export`, and `roundtrip` commands use the app's `/op/appdata` endpoint (POST = import/overwrite, GET = export). This endpoint:

- Is **opt-in** — the API must be started with `VG_EXPERIMENTAL_APPDATA=true`
- Requires the **mock OIDC** service on `:18080` — the loader mints a bearer token by sending a **GET** to `/api/get-token` with the admin username, then POSTs (import) or GETs (export) `/op/appdata`
- The loader token uses the narrow scope `vg:op`. Scopes are **hierarchical** (prefix-matched), so `vg:op` also satisfies the export endpoint's `vg:op:read` — longer scopes are restrictions of their shorter parents

> **Note:** When logging in via the mock-OIDC browser form to use the app itself, enter the wider scope string into the form:
> `vg:op vg:village vg:person vg:service-request vg:member vg:volunteer vg:user vg:friends:read`

This path exercises the `/op/appdata` endpoint itself and **may surface endpoint bugs**. The SQL `seed:db` command is the always-works fallback and is recommended for most development use.

## Demo personas and mock-OIDC logins

When using the mock OIDC login form, enter one of the usernames below. Leave the password field blank (or use whatever the mock OIDC accepts). Use the scope string:

```
vg:op vg:village vg:person vg:service-request vg:member vg:volunteer vg:user vg:friends:read
```

Grants are drawn from the DB's static 7-role catalog (`role`/`role_grant`; the generator never seeds those catalog tables themselves — only `role_grant` rows against fixed role ids from `generator/constants.js`):

| Role | Scope | Notes |
|---|---|---|
| Admin | federation-wide | Sees and can do everything, incl. elevate |
| Staff | federation-wide | Full operational read/write; **creates service requests** |
| Service Coordinator | federation-wide | Service-request coordination across villages; **creates service requests** |
| Board | federation-wide | Redacted federation-wide visibility |
| Village Lead | per-village | Village reads incl. member financials |
| Steering Committee | per-village | Village governance read access |
| Local Service Coordinator (LSC) | per-village | Village-scoped read access |

| Username | Village | Role / notes |
|---|---|---|
| `admin` | all 10 | **Admin** (the mock-OIDC form's default username) |
| `samuel.slater@millworks.test` | — | **Admin** — sees all villages directly via the Admin grant; he's kept with no village-level grants of his own so the elevate escalation can still be demoed |
| `samuel.gorton@hub.test` | — | **Staff** — SR creator pool |
| `elizabeth.chace@hub.test` | — | **Service Coordinator** — SR creator pool |
| `moses.brown@board.test` | — | **Board** |
| `roger.williams@providence.test` | Arkham | Village Lead |
| `hp.lovecraft@miskatonic.test` | Arkham | Steering Committee |
| `peter.griffin@quahog.test` | Quahog | Village Lead |
| `john.brown@brownbros.test` | Quahog + Innsmouth + Arkham | Village Lead ×3 — exercises the **meta roll-up** (3+ villages) |
| `nathanael.greene@newport.test` | Oldport | LSC |
| `gilbert.stuart@gmail.test` | Quahog | Steering Committee |
| `ann.franklin@providence.test` | New York System | Village Lead |
| `ida.lewis@lighthouse.test` | Oldport | Village Lead |
| `obed.marsh@innsmouth.test` | Innsmouth | Village Lead |
| `richard.pickman@kingsport.test` | Kingsport | Village Lead |
| `wilbur.whateley@dunwich.test` | Dunwich | Village Lead |
| `betty.bett@chepachet.test` | Chipwhich | Village Lead |
| `abraham.whipple@pawtuxet.test` | Pawstuxnet | Village Lead |
| `roger.mowry@cabinet.test` | Cabinet | Village Lead |
| `mr.calimari@quahog.test` | — | No grants — valid login, sees nothing |

Beyond these bespoke personas, a **coverage fill** pass tops up every village so it has at least one user of **each** per-village role (Village Lead / Steering Committee / LSC); the two big villages get 2–3 of each. Fill users are themed per village (`herbert.west@miskatonic.test`, `lois.griffin@quahog.test`, `alva.vanderbilt@newport.test`, `zadok.allen@innsmouth.test`, …) — see `FILL_LOGINS` in `generator/builders/villages.js` for the full roster. Any of them works as a mock-OIDC login. Every user carries a `name` claim in `lastClaims`, so creator attribution renders a display name rather than an email.

**Staff (`samuel.gorton@hub.test`) and Service Coordinator (`elizabeth.chace@hub.test`) are the only two service-request creators** — every `service_request.createdUserId` in the dataset points at one of them. Separately, a random ~25% of each village's active volunteers get a mock-OIDC login for **volunteer self-service (VSS)** demos (`generator/builders/vss.js`); a service request's `modifiedUserId` marks a VSS touch and, when set, always references one of these volunteer-only user ids, never a Staff/SC id. The full VSS login list is in `demo-logins.json`, not this table.

## Demo guide & login roster

Every *generating* command (`seed`/`seed:db`, `seed:api`, `emit`, `roundtrip`, `doctor`) writes two files to `data/` before doing anything else:

- **`demo-guide.md`** — a map of the dataset: which login demos which grant, per-village member/volunteer counts, the planted scenarios (dual household, member-who-also-volunteers, duplicate email, inactive members/volunteers, confidential-notes member, flexible-time ride, out→home ride, the longest standing series, the privacy-ack-modal login) and their exact IDs/names, community-participant rosters, and a full gag-request index (figure → village → request #).
- **`demo-logins.json`** — the complete login roster (every `user_data` row, incl. VSS volunteer accounts), each with role, village(s), and a one-line "demos" blurb. This is the droplist the demo mock-OIDC UI offers (spec §7); a `featured` flag marks the handful surfaced by default (the 8 usernames in `FEATURED` in `generator/guide.js`, plus the first three VSS logins and the privacy-ack-modal login) — not the full bespoke-persona table above, which is larger.

Both are **gitignored** (`data/.gitignore`) and regenerated fresh on every generating run — treat them as build output, not source.

## Privacy rules and acknowledgements

The dataset publishes **one privacy-rules version** (a playground-flavored agreement, published and typo-fix-patched by `samuel.slater`) and an **acknowledgement for every user**, so no demo login ever hits the ack modal. This matters more than it looks: the API blocks nearly every endpoint (`privacy_ack_required`) for any user who hasn't acknowledged the current rules — only the spec, the rules text, the ack POST, and `/user` are reachable. Two consequences:

- Typing a **new** username into the mock OIDC form gets the ack modal on first login (realistic, and a handy way to demo the feature).
- Acknowledgements only count if they are **newer than `VG_PRIVACY_ACK_INTERVAL_DAYS`** (default 365). The seeded acks are dated April–May 2026, so around **spring 2027** they age out and every login starts modal-ing — re-seed, or publish a fresh rule in the Admin hub.

The loader's machine account (`demo-loader@villagegreen.test`) is pre-seeded **with** an acknowledgement for the same reason — otherwise the app would create it on the loader's first call and the ack gate would 403 the import/export commands themselves.

## How the dataset is built

Everything derives from three content files — `content/people.json` (the figure roster), `content/services.json` (the service catalog + member-note flavor), `content/destinations.json` (real RI places + the invented Miskatonic Health network) — fed through seeded-RNG builders in order: **villages + demo logins → privacy rule + acknowledgements → persons** (figures placed into villages by theme/hint) **→ membership** (member/volunteer rows split per-village per the sizing knobs above — volunteer-heavy by default, member-heavy for Quahog/Oldport/Kingsport; ~66% of members get a standing `serviceNotes`, ~40% a staff-only `confidentialNotes`, and every member carries `householdDues` ($0–60, usually $40); ~5% of each side is inactive, drawn from the invented-descendant filler persons first) **→ service requests + FCV submissions**.

Service requests are built in two passes:

1. **Gag pass** — each gag-tagged figure who landed as a member gets one bespoke request from their `gag` block in `people.json`. The free-text gag title is keyword-mapped onto a real UI service name, title + blurb become the `description`, and the gag's destination is used as-is.
2. **Volume pass** — each village gets ≈ 0.5 × its active-member count of ordinary bookings: a random active member × a weighted-random `catalog` entry (`Ride: Medical Appnt` ×6, other rides ×3 — prod is medical-ride-heavy) × a random destination from a pool matched to the service (medical → Miskatonic Health, shopping → grocery/food landmarks, personal care → the barber, activities → landmarks).

Any booking (gag or ordinary) can become a **standing request**: the same trip re-booked every 1/2/4 weeks for a handful of occurrences spanning past and future — past ones mostly Completed, upcoming ones Confirmed/Open, usually with the same regular volunteer, all sharing one entry timestamp and creator. Medical rides recur most (think dialysis runs); we're deliberately loose about what "recurs" — it's demo data, so Roger Williams may well draw a second banishment ride a month later.

Field rules mirror the client UI (`ServiceRequestCreateEdit.vue`): `serviceName` is always one of the ten `serviceNameOptions`; rides are `Round Trip` (~80%) or `One Way`, everything else `None`; Tech Support and Household Chores/Handy Help set no location fields, all others get destination/address/city/state; Round Trips carry `apptTime`/`returnTime` in Start → Arrival → Return → Finish slot order; non-Ride requests never carry times at all (`timesFlexible: true`, all four TIME columns null) — times are a Rides-only concept, matching the client. A member's `serviceNotes` is echoed into `instructions` on every one of that member's requests, matching how prod repeats standing mobility notes. Members can hold several requests, but never two that overlap in time — the builder re-rolls the day/slot until it clears the member's other bookings. Every request's `createdUserId` points at the **Staff or Service Coordinator persona** (`samuel.gorton@hub.test` / `elizabeth.chace@hub.test` — staff enter requests on behalf of members), so the app's creator attribution shows a plausible name regardless of which village the request belongs to.

## Maintaining the generator through schema changes

The schema is expected to change routinely. Two conventions keep those changes cheap:

- **Builders set only the columns they mean.** Both load paths (direct SQL and app-data) omit unset columns so DB defaults apply — the generator never has to chase columns it doesn't care about.
- **The doctor runs before every command** and compares what the builders emit against the live schema. Everything actionable is a hard **error** with the exact `table.column` named: a renamed/dropped column the builders still set, a new NOT-NULL-without-default column, or a **new unset column not yet acknowledged**. Every consciously-unset column lives in `generator/doctor-baseline.json` with a one-line reason — so when the schema grows a column, someone must either populate it in a builder (usually what we want, even for nullables) or record why not. Stale baseline entries (column since populated or dropped) surface as notices; prune them.

After merging schema changes from main: `npm test && npm run roundtrip` exercises the builders, the UI-rule invariants, the live schema, and the `/op/appdata` endpoint in one shot.

**Adding a new table**: add it to `TABLE_ORDER` in `generator/constants.js` (parent-before-child), build its rows in a builder, wire the builder into `generator/data.js`, and extend the `sanity()` counts in `generator/cli.js` plus a test.

## Determinism

The dataset is fully deterministic. The RNG seed defaults to `20260630` (`VG_DEMO_SEED`). **Same seed + same sizing knobs ⇒ byte-identical output** — every run rebuilds the same persons, households, memberships, service requests (gag bookings, ordinary volume, and standing series alike), notification records, `demo-guide.md`, and `demo-logins.json`. Change `VG_DEMO_SEED` for a different (but equally deterministic) dataset, or the `VG_DEMO_VILLAGES`/`VG_DEMO_MEMBERS`/`VG_DEMO_VOLUNTEERS` knobs for a different (equally deterministic) size.

Two invariants hold regardless of seed or sizing: **vettings never expire** (`volunteer_vetting.dateExpired` is always drawn 60–700 days after the generator's fixed clock (`BASE_DATE`, 2026-06-30) — nothing in the demo data is stale-vetting-blocked, though it will eventually age past *today's* real-world date), and **non-Ride requests never carry times** (`timesFlexible: true`, all TIME columns null — times are a Rides-only concept).

The cameos are real Rhode Island historical figures and Lovecraft-lore characters, with gag service requests written to match their biographies.
