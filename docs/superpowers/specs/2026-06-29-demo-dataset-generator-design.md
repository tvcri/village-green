# Demo dataset generator — design

- **Date:** 2026-06-29
- **Status:** Approved (composition + architecture) — pending written-spec review
- **Author:** cd-rite (with Claude)
- **Related:** `test/api/` black-box suite, `docs/superpowers/specs/2026-06-28-api-test-scaffold-design.md`

## Goal

Produce a **decently fleshed-out, deliberately fun demo dataset** for Village Green —
roughly ten RI-lore-themed villages of uneven size, hundreds of people, members,
volunteers (with capabilities/vetting), and a few hundred service requests across
every status — plus a **repeatable generator script** that builds and loads it. The
dataset should exercise the UI harder than the test fixtures do: meta roll-up across
villages, list scrolling in big villages, household linkage, inactive-record
filtering, notification history, and the Friends/FCV view.

Secondary goal: give the **app-data import/export endpoint** (`/op/appdata`) its first
real exercise. It is currently feature-flagged and untested.

## Non-goals

- Not a test suite. This is dev/demo tooling (it may grow a smoke test, but its job is
  to *populate*, not assert).
- Not seeded through the public CRUD API. Member/Volunteer CRUD is stubbed (see
  Background), so a pure-API loader is impossible.
- No new production endpoints, schema changes, or migrations.
- Not wired into CI by default (it targets a long-lived dev DB, not the ephemeral test DB).

## Background — constraints discovered

These shaped the design and must be respected by the implementation:

1. **Member & Volunteer CRUD is fully stubbed.** Every handler in
   `api/source/controllers/Member.js` and `Volunteer.js` returns `res.json({})` with a
   `// TODO: Implement`. There is **no HTTP path** to create members, volunteers,
   volunteer capabilities/vetting, person disabilities, notification events, or FCV
   submissions. The membership layer must be written by **direct SQL** (or app-data import).
2. **What the API *can* create:** villages, persons, users + grants, service requests
   (+ PATCH to transition status). We are not using this path for the generator (SQL is
   simpler and covers everything), but it remains available for future API-exercising tests.
3. **App-data format** (`api/source/service/OperationService.js`): newline-delimited JSON
   (JSONL) — a version header record, a tables-summary record, then per table a header
   record `{table, columns, rowCount}` followed by one **array per row** in column order.
   Import (`POST /op/appdata`) is a **destructive REPLACE**: truncates everything, then
   inserts with `FOREIGN_KEY_CHECKS=0`, client-supplied PKs.
4. **Export excludes generated columns.** The export column query filters
   `EXTRA NOT LIKE '% GENERATED'` (`OperationService.js:100`) and inserts only those columns
   on import (`:362`). So `person.address` (a STORED generated column from `street`/`unit`)
   is correctly omitted. Our emitter mirrors this exactly — no generated-column insert errors.
5. **App-data is gated:** requires env `VG_EXPERIMENTAL_APPDATA=true`, OAuth scope `vg:op`
   (write) / `vg:op:read` (export), `elevate=true`, and the caller must hold the `admin`
   privilege.
6. **Lookups:** `capability` ships with 13 seeded rows (stable IDs) — reference by **name**,
   never re-id. `disability` and `vetting_type` ship **empty** — the generator seeds a small
   themed set of each.
7. **Status derivation** (`ServiceRequestService.js` `deriveStatus`): `Draft`, `Completed`,
   and the three cancelled statuses are explicit/terminal; otherwise status is `Confirmed`
   when a `volunteer_person_id` is present, else `Open`. The generated rows must be internally
   consistent with this rule.
8. **Views:** `active_member` = `member.status = 'Active'`; `active_volunteer` =
   `volunteer.active = 1`. Some inactive rows are included so the UI's view-based filtering
   is observable.

## Architecture

New **top-level `data/` directory** (its own feature branch, `2026-06-30-demo-dataset`,
off `main`). It is **self-contained**: the test harness (`test/api/`) lives on a different
branch, so `data/` does **not** import from it — it carries its own small mysql2 connection
helper and (for the opt-in app-data path) its own mock-OIDC token minting, mirroring the
harness patterns rather than depending on them.

```
data/
  content/                 committed source material (finalized from the lore packs)
    people.json            57 notable figures (+ gags) and login personas
    destinations.json      55 destinations + 21 "Miskatonic Health" facilities
    services.json          service names, transport types, chores, FCV flavor,
                           drop reasons, vetting types, disabilities
  generator/               generator source (ES modules)
    cli.js         entry: node generator/cli.js [--sql] [--emit[=file]] [--import] [--roundtrip]
    data.js        builds the canonical in-memory dataset (named objects, explicit ids)
                   deterministically from ../content/ + a fixed seed
    rng.js         tiny seeded PRNG (mulberry32) so output is reproducible
    seed-sql.js    PRIMARY loader: TRUNCATE owned tables child-first, then INSERT via mysql2
    emit-appdata.js  serialize the canonical dataset -> app-data JSONL (export format)
    load-appdata.js  mint an admin token (mock OIDC) or take one via env, POST to /op/appdata
    db.js          self-contained mysql2 connection helper
    env.js         dev-DB + API config from env (defaults match docker-compose.dev.yml)
  demo-appdata.jsonl       optional generated artifact (reproducible; commit is optional)
  README.md                how to run; the demo personas table + their mock-OIDC logins
  package.json             { "type": "module" }, depends on mysql2
```

### Components

- **`data.js` (canonical dataset).** Returns an object keyed by table name, each a list of
  plain row objects with **named fields and explicit integer ids** assigned in-script (the
  same readable named-object style the API test fixtures use, just bigger and procedurally built).
  This is the single source of truth both loaders consume. IDs are allocated by simple
  per-table counters — no reliance on auto-increment, and no column-position bookkeeping.
- **`seed-sql.js` (primary).** Opens one mysql2 connection to the dev DB, disables FK checks,
  truncates the owned tables child-before-parent (same child-before-parent pattern the test
  harness uses, extended for the richer tables), seeds the `disability`/`vetting_type` lookups, resolves
  `capability` ids by name, then inserts every table with **named columns** (never the
  generated `address`). Idempotent: re-runs reset cleanly.
- **`emit-appdata.js` (opt-in).** Introspects `INFORMATION_SCHEMA.COLUMNS` for each table,
  **excluding generated columns** (`EXTRA NOT LIKE '% GENERATED'`), to get the authoritative
  column order, then serializes the canonical dataset into app-data JSONL: version header,
  tables summary, and per-table `{table, columns, rowCount}` + row arrays. Column alignment is
  derived from the live schema, so the file stays correct across future migrations — the script
  aligns columns, never a human.
- **`load-appdata.js` (opt-in).** Mints/uses an admin token (mock OIDC, like the test harness's
  `tokens.js`) and POSTs the JSONL to `/op/appdata?elevate=true` with `Content-Type:
  application/jsonl`. Surfaces the endpoint's progress/result stream.
- **`cli.js`.** Orchestrates: `--sql` (default) seeds the dev DB; `--emit[=path]` writes the
  JSONL artifact; `--import` loads that artifact via the endpoint; `--roundtrip` seeds via SQL,
  calls real `GET /op/appdata` to export, then POSTs it back and asserts success.

### Data flow

```
content/*.json  ─┐
                 ├─► data.js (canonical: named rows, explicit ids, fixed seed)
rng.js (seed) ───┘        │
                          ├─(default)─► seed-sql.js ─► mysql2 TRUNCATE+INSERT ─► dev DB :3308
                          │                                   (works today; no flags/token)
                          └─(opt-in)──► emit-appdata.js ─► demo-appdata.jsonl
                                                │
                                                └─► load-appdata.js ─► POST /op/appdata?elevate=true
                                                       (needs VG_EXPERIMENTAL_APPDATA + admin token)
```

### Key design decisions

- **Deterministic.** A fixed seed drives a small PRNG (`rng.js`); same input ⇒ same dataset
  every run, so diffs are reviewable and demos reproducible. The emitted `demo-appdata.jsonl`
  may be committed as a portable artifact.
- **SQL is the spine; app-data is opt-in.** SQL works without the experimental flag or a token
  and can load the stubbed-CRUD tables. The app-data path is for exercising the endpoint, with
  SQL as the always-works fallback.
- **Column alignment via live-schema introspection**, excluding generated columns — never
  hand-maintained column lists.
- **Targets the dev DB** (`docker-compose.dev.yml`, `:3308`, `vg`/`vg`) by default via `env.js`;
  overridable by env vars. Never points at the test DB or anything in CI by default.
- **Lookups:** reference the 13 seeded capabilities by name; seed themed `disability` and
  `vetting_type` rows (those tables are empty by default).

## Dataset composition

### Villages (~10, uneven sizes; two big enough to scroll)

| Village | Theme | Size (members / volunteers) |
|---|---|---|
| **Arkham** | Miskatonic U + **Miskatonic Health** everywhere | **big: ~55 / ~50** |
| **Quahog** | Family Guy | **big: ~55 / ~45** |
| Providence | Poe, Cianci, Secret Mall Apartment, RISD/Byrne cameos | medium ~20 / ~15 |
| Newport | the Bellevue Ave mansions, Ida Lewis | medium ~15 / ~12 |
| Innsmouth | low-key Lovecraft coastal | small–med ~12 / ~8 |
| Kingsport | low-key Lovecraft coastal | small ~8 / ~6 |
| Dunwich | low-key Lovecraft rural | small ~8 / ~5 |
| Chepachet | Little Bett + the Ancients & Horribles Parade | small ~6 / ~4 |
| Pawtuxet | Burning of the Gaspee / Gaspee Days | small ~6 / ~4 |
| Cabinet, RI | made-up lore | tiny ~4 / ~3 |

Village count and sizes are parameters in `data.js` (easy to add Delsborough, etc.).
Destinations are **global** (real RI places), not bound to a village — a Quahog member can
be driven to the Big Blue Bug.

### Scale targets (approximate; deterministic exact counts fall out of the seed)

- **persons** ~300 · **members** ~180 (a slice inactive) · **volunteers** ~130 (capabilities +
  some vetting; a slice inactive) · **service_requests** ~280 across all statuses ·
  **notification_event** ~500 · **fcv_submission** ~50 · **login users** ~18.
- **Cameo mix (~100% real people):** ~90 **marquee gag cameos** (each with a bespoke gag request)
  + ~210 **background cameos** (real RI / New England / fictional-RI names in rosters, ranging from
  famous to genuine deep cuts; some with ordinary requests). **No made-up filler** — an obscure-but-
  real name is no less recognizable than an invented one and is at least a real Easter egg, so we use
  real names even for the bulk. (Invent a name only as a last resort for a household partner with no
  documented real counterpart.)
- Members and volunteers are **mostly distinct populations** — only **~10% of volunteers are also
  members** (members receive services; volunteers provide them). So a big scroll village needs ~50
  member-people **and** ~50 (mostly different) volunteer-people — ~100 persons — which is why Arkham
  & Quahog are the largest and the total person count runs ahead of the member count.

### Login personas & auth anchors (documented in `data/README.md`)

Drawn from `data/content/people.json` (`loginPersonas`, 15 provided). `user_data` username =
an email; mock OIDC echoes whatever you type, so the username only has to match a grant.
roleId: 1 restricted · 2 full · 3 manage · 4 owner. Required structural anchors:

- ≥1 **admin** privilege, **no grants** (e.g. Samuel Slater) — sees everything via elevate.
- ≥1 **owner** of each big village (e.g. Roger Williams).
- ≥1 **multi-village coordinator** granted in **≥3 villages** — exercises the meta roll-up.
- At least one of **each** role somewhere (restricted/full/manage/owner).
- ≥1 user with valid auth but **zero grants** — must see nothing.

### Entity variety (what flexes the UI)

- **persons:** rich fields populated (emergency contacts, birth dates, computer_use/smartphone,
  comments) so detail views aren't empty. **Essentially everyone is a real figure** themed by
  village — Family Guy cast in Quahog, Lovecraft/Conjuring names in the eldritch villages
  (Innsmouth/Kingsport/Dunwich/Arkham), and politicians/athletes/musicians/Gilded-Age-Newport/
  colonial figures (down to deep cuts) spread across the rest.
- **members:** mostly `Active`; **~6 households** (primary + secondary spouse via
  `primary_person_id` / `secondary_type`, e.g. Peter & Lois Griffin; famous couples welcome);
  **a slice inactive**
  (`status` Inactive/Dropped + themed `drop_reason`) to prove the `active_member` view filters.
- **volunteers:** mostly `active=1`; a slice `active=0`; each active one gets 1–3 **capabilities**
  from the seeded 13; **some with vetting** (Background Check / Driving Record, a few expired).
- **person_disability:** a handful across members (e.g. Joe Swanson → Mobility).
- **service_requests:** ~40% Open, ~30% Confirmed, ~15% Completed, ~10% Draft, ~5% cancelled —
  Confirmed/Completed have a volunteer assigned (consistent with `deriveStatus`); Completed/cancelled
  dated in the past, Open/Confirmed in the near future; destinations from `data/content/destinations.json`.
- **notification_event:** history per non-Draft request (open → confirmed → completed/cancelled,
  occasional reminder), `sent_at` set for past events, `recipients` JSON = involved person ids.
- **fcv_submission:** ~60 Friendly Calls & Visits so `GET /friends` has content.

### Cameos (the headline feature — ~90% of people)

Two tiers, both drawn from the expanded `data/content/people.json` roster (~300 real figures, each
tagged `gag` or `background`):

- **Marquee gag cameos (~90):** members with a bespoke on-theme service request. Examples:

- **Gilbert Stuart** → ride to the paint store (out of Naples yellow before a Washington sitting)
- **Thomas Tew** → ride to *Miskatonic Health Surgery* for a same-day **cannonballectomy**
- **Ambrose Burnside** → ride to the barber (the sideburns won't trim themselves)
- **Oliver Hazard / Matthew Perry** → errand: help *opening Japan* / black paint for the ships
- **Spalding Gray** → errand: pick up the typewriter (and a glass of water)
- **Harry Anderson** → ride to a late-night court appointment
- **Little Bett** → XL transport to the Ancients & Horribles Parade (route around the grist mill)
- **Edgar Allan Poe** → 2 a.m. ride to the Providence Athenæum
- **Mercy Brown** → late-night ride to the Exeter cemetery (bring a shovel)
- **Secret Mall Apartment crew** → discreet cargo ride, 5,000 lbs of cinderblock; tell no one, it's art
- **Buddy Cianci** & **Lincoln Chafee** → seeded as Providence login personas (owner/manage)

- **Background cameos (~210):** real RI / New England / fictional-RI names populating the rosters,
  **famous → genuine deep cut** (the full Family Guy cast, Lovecraft & Conjuring characters, Newport
  Gilded-Age set, colonial settlers, mill owners, sea captains, lighthouse keepers, RI athletes/
  musicians/authors, Patriarca-era characters, local pols, RISD/Brown alumni, etc.) — some with
  ordinary requests, most just present so scrolling a big village is a "wait, is that…?" delight.

### Content provenance

The three `data/content/*.json` files are finalized during implementation from lore packs generated
by themed research subagents. The people roster is **expanded from the initial 57 to ~300 real
figures** via a fan-out of **category-specific subagents** (colonial/historical, Gilded-Age Newport,
politicians/mobsters, athletes, musicians/RISD/artists, authors/Lovecraft, fictional-RI/Family Guy,
oddballs/legends, nearby New England) — explicitly digging for **documented obscure-but-real** names
to fill the bulk, **no made-up filler**. Each tags figures `gag` (with a bespoke request) or
`background`. Initial packs are in the session scratchpad (`lore-people.json`,
`lore-destinations.json`, `lore-services.json`). They are committed so the dataset is
reproducible without re-running the agents.

## Correctness invariants (the generator must hold these)

1. Never insert `person.address` (generated). Insert `street`/`unit`.
2. `service_request.status` consistent with `deriveStatus`: Confirmed ⟺ volunteer assigned and
   not terminal; Open ⟺ no volunteer; Draft/Completed/cancelled are explicit.
3. `member.status='Active'` for rows that should appear in `active_member`; inactive rows carry a
   non-Active status + `drop_reason`.
4. `volunteer.active=1` for rows that should appear in `active_volunteer`.
5. FK references resolve (person→village, member/volunteer→person, service_request person ids →
   persons in the same village, grants → existing user + village). SQL load truncates
   child-before-parent and inserts parent-before-child (or disables FK checks during load).
6. `capability` referenced by existing seeded id (resolved by name); `disability`/`vetting_type`
   seeded before their junction rows.
7. App-data JSONL excludes generated columns and lists columns in `INFORMATION_SCHEMA` order.

## App-data path specifics

- Requires `VG_EXPERIMENTAL_APPDATA=true` on the API, OAuth scope `vg:op`, `elevate=true`, and an
  `admin`-privileged token (minted against mock OIDC by `data/`'s own self-contained helper, or supplied via env).
- `--roundtrip` is the endpoint's first real test: SQL-seed → `GET /op/appdata` export →
  `POST /op/appdata` import → assert success and a sane row count. Any failure is a genuine
  finding to report (the endpoint has never been exercised).

## Testing / verification

- After `--sql`: a lightweight post-load sanity check (row counts per table within expected ranges;
  every `Confirmed`/`Completed` request has a volunteer; `active_member`/`active_volunteer` counts
  < raw counts). Can live as an assert block in `cli.js` or a tiny `node:test` file.
- Manual: run the dev stack, log in as the documented personas, confirm meta roll-up for the
  multi-village coordinator, scrolling in Arkham/Quahog, household display, inactive filtering,
  notification history, and the Friends view.
- `--roundtrip` for the app-data endpoint.

## Risks / open questions

- **Untested endpoint.** `/op/appdata` may have bugs beyond generated columns (e.g. JSON column
  encoding for `notification_event.recipients`, migration-version checks). SQL load is the
  fallback; round-trip findings get written up (mirroring `SECURITY-FINDINGS.md` style) rather
  than blocking the demo data.
- **Scale vs. dev box.** ~300 people / ~280 requests / ~500 notifications is comfortable for MySQL
  but the seeder should batch inserts to stay fast.
- **All-real roster (~100%).** Per decision there is essentially no made-up filler — obscure-but-real
  names fill the bulk (an unrecognized real name is no worse than an unrecognized invented one, and
  it's a real Easter egg). The remaining risks are *thin* (hard to verify), *duplicate*, or
  *misattributed* figures. Mitigations: each figure carries a one-line real blurb; **de-dupe across
  villages** (no one appears twice); category-specific subagents dig for documented obscure
  RI/New England people; accuracy is best-effort and secondary to fun.
- **Committed artifact size.** Committing `demo-appdata.jsonl` is optional; the generator can
  always reproduce it. Default: commit `data/content/*.json` (source) but not the generated JSONL.
