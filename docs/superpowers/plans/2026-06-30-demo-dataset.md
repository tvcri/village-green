# RI-Lore Demo Dataset Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained `data/` tool that deterministically generates a fun, ~100%-real-RI-cameo demo dataset and loads it into the dev DB via a primary direct-SQL seeder, with an opt-in app-data JSONL emitter + round-trip that exercises the untested `/op/appdata` endpoint.

**Architecture:** One canonical in-memory dataset (`generator/data.js`, built from committed `data/content/*.json` + a fixed-seed PRNG) is consumed by two loaders: a generic mysql2 SQL seeder (default) and an app-data JSONL emitter whose output is POSTed to `/op/appdata`. The membership layer (member/volunteer/junctions/notifications/fcv) is written by SQL because its CRUD endpoints are stubbed.

**Tech Stack:** Node.js ≥18 (ESM), `node:test` + `node:assert/strict`, `mysql2/promise`, global `fetch`. Dev DB = MySQL 8 from `docker-compose.dev.yml` (`127.0.0.1:3308`, `vg`/`vg`/`vg`). Mock OIDC = `test/utils/mockOidc.js` on `:18080`. Dev API on `:54000`.

## Global Constraints

- **Branch:** `2026-06-30-demo-dataset` (off `main`). All new code lives under top-level `data/`.
- **Self-contained:** `data/` must NOT import from `test/api/` or `test/utils/` (different branch). It may *call* the running mock OIDC over HTTP. Carry its own mysql2 + token-mint helpers.
- **Deterministic:** every build uses a fixed seed (`config.seed`, default `20260630`). No `Date.now()`/`Math.random()` in dataset construction — only the seeded PRNG. Timestamps in data are computed from a fixed `BASE_DATE = '2026-06-30T12:00:00Z'` ± offsets, never "now".
- **Never insert `person.address`** — it is a STORED generated column (`concat_ws(', ', street, unit)`). Set `street`/`unit` only.
- **`deriveStatus` consistency** (mirrors `api/source/service/ServiceRequestService.js`): a `service_request` row's `status` is `Confirmed` ⟺ `volunteer_person_id` is set AND status is not a terminal/explicit one; `Open` ⟺ no volunteer; `Draft`/`Completed`/`Member cancelled`/`Volunteer cancelled`/`Hub cancelled` are explicit. `Completed`/cancelled rows that had a volunteer keep `volunteer_person_id` set.
- **Lookups:** `capability` MUST use the exact static-seed ids (Errands=1, Friends=2, Home Help=3, Tech Support=4, Rides=5, Circles=6, Governance=9, Healthcare Support=10, New Member Intake=12, Office Services=13, Safety Net=15, Service Referrals=16, Village Affiliation=18). `disability` and `vetting_type` are empty by default and get demo-assigned ids starting at 1.
- **Cameo policy:** ~100% real people, no made-up filler (invent a name only for an undocumented household partner). Figure `name` is globally unique across the whole dataset (de-dupe), and `(village_id, full_name)` is unique per the schema.
- **JSON columns** (`notification_event.recipients`, `fcv_submission.activityTypes`, `user_data.lastClaims`) are stored in the canonical dataset as **JSON strings** (`JSON.stringify(...)`), so both the SQL bind and the JSONL row carry a string (matching the real export's text typecast).
- **App-data preconditions:** `POST /op/appdata` requires `VG_EXPERIMENTAL_APPDATA=true` on the API, OAuth scope `vg:op`, `?elevate=true`, and `Content-Type: application/jsonl`. The API does not check `iss`; it verifies the JWT signature via JWKS from `VG_OIDC_PROVIDER` (the mock OIDC).

---

## File Structure

```
data/
  package.json            { "type": "module" }, deps: mysql2; scripts: test/seed/emit/import/roundtrip
  README.md               run instructions + the demo personas/login table
  content/
    people.json           { figures: [...~300...], loginPersonas: [...] }   (Task 3)
    destinations.json      { destinations: [...], miskatonicHealth: [...] }  (Task 2)
    services.json          { serviceNames, transportationTypes, householdChores,
                             fcvActivities, memberDropReasons, vettingTypes, disabilities }  (Task 2)
  generator/
    env.js                config from env vars (DB/API/OIDC/seed/token)      (Task 1)
    rng.js                seeded PRNG (mulberry32) + helpers                  (Task 1)
    db.js                 mysql2 withDb() + generic insertRows()             (Task 1)
    constants.js          CAPABILITIES (static ids), VILLAGES, TABLE_ORDER   (Task 4)
    builders/
      villages.js         villages + user_data + village_grant + personas    (Task 4)
      persons.js          person rows from the figure pool (themed, households) (Task 5)
      membership.js       member, volunteer, lookups, junctions               (Task 5)
      requests.js         service_request + notification_event + fcv_submission (Task 6)
    data.js               orchestrates builders -> canonical dataset          (Task 6)
    seed-sql.js           truncate + insertRows all tables (default loader)    (Task 7)
    emit-appdata.js       rowToArray/buildJsonl + columnMapFromDb             (Task 8)
    load-appdata.js       mintToken() + importAppData()                       (Task 9)
    cli.js                arg parse + orchestrate + post-load sanity asserts   (Task 9)
  test/
    rng.test.js           (Task 1)
    content.test.js       (Tasks 2-3)
    data.test.js          (Tasks 4-6) — the invariant suite
    emit-appdata.test.js  (Task 8)
```

**Canonical dataset shape** (the object every builder contributes to and both loaders consume). Keys are table names; values are arrays of row objects whose keys are **exact DB column names**:

```
{
  village:              [{ id, name }],
  user_data:            [{ userId, username, lastClaims }],            // lastClaims = JSON string
  village_grant:        [{ villageId, userId, roleId }],               // userGroupId omitted (null)
  capability:           [{ id, name }],                                // static ids
  disability:           [{ id, name }],
  vetting_type:         [{ id, name }],
  person:               [{ id, village_id, full_name, first_name, last_name, nickname,
                           street, unit, city, state, zip, email, phone, cell,
                           computer_use, smartphone, birth_date,
                           emergency_contact_name, emergency_contact_relationship,
                           emergency_contact_phone, emergency_contact_email, comments }],
  member:               [{ id, person_id, member_number, member_type, primary_person_id,
                           secondary_type, join_date, status, drop_reason, household_size }],
  volunteer:            [{ id, person_id, provider_type, active }],
  volunteer_capability: [{ id, volunteer_id, capability_id }],
  volunteer_vetting:    [{ id, volunteer_id, vetting_type_id, date_entered, date_expired }],
  person_disability:    [{ id, person_id, disability_id }],
  service_request:      [{ id, request_number, village_id, member_person_id, volunteer_person_id,
                           status, service_name, transportation_type, destination,
                           created_at, start_at, finish_at, instructions, description }],
  notification_event:   [{ id, event_type, service_request_id, created_at, sent_at, recipients }],
  fcv_submission:       [{ id, villageId, villageName, volunteerPersonId, rawVolunteerName,
                           memberPersonId, rawMemberName, visitDate, timeSpentMinutes,
                           contactType, activityTypes, activityOther, notes, submittedAt }],
}
```

Row objects within a table MUST all share the same key set (the generic `insertRows`/`rowToArray` derive columns from `Object.keys(rows[0])` / the live column map). Omitted nullable columns simply aren't keys; `insertRows` sends `NULL`.

---

### Task 1: Scaffold `data/` package — env, seeded PRNG, DB helper

**Files:**
- Create: `data/package.json`
- Create: `data/generator/env.js`
- Create: `data/generator/rng.js`
- Create: `data/generator/db.js`
- Test: `data/test/rng.test.js`

**Interfaces:**
- Produces: `config` (object) from `env.js`; `makeRng(seed) -> { next, int(min,max), pick(arr), shuffle(arr), weighted(pairs), bool(p) }` from `rng.js`; `withDb(fn)` and `insertRows(conn, table, rows)` from `db.js`.

- [ ] **Step 1: Create `data/package.json`**

```json
{
  "name": "village-green-demo-data",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Deterministic RI-lore demo dataset generator + loaders for Village Green",
  "scripts": {
    "test": "node --test",
    "seed": "node generator/cli.js --sql",
    "emit": "node generator/cli.js --emit",
    "import": "node generator/cli.js --import",
    "roundtrip": "node generator/cli.js --roundtrip"
  },
  "dependencies": {
    "mysql2": "^3.11.0"
  }
}
```

- [ ] **Step 2: Create `data/generator/env.js`**

```js
// All runtime config from env, with defaults matching docker-compose.dev.yml +
// .vscode/launch.json. No secrets here.
const e = process.env

export const config = {
  db: {
    host: e.VG_DB_HOST || '127.0.0.1',
    port: Number(e.VG_DB_PORT || 3308),
    user: e.VG_DB_USER || 'vg',
    password: e.VG_DB_PASSWORD || 'vg',
    database: e.VG_DB_SCHEMA || 'vg',
  },
  api: { base: e.VG_DEMO_API_BASE || 'http://localhost:54000' },
  oidc: { base: e.VG_DEMO_OIDC_BASE || 'http://localhost:18080' },
  seed: Number(e.VG_DEMO_SEED || 20260630),
  token: e.VG_DEMO_TOKEN || null, // optional pre-minted bearer token for the app-data path
}

// Fixed clock for deterministic data. NEVER use Date.now() in builders.
export const BASE_DATE = new Date('2026-06-30T12:00:00Z')
```

- [ ] **Step 3: Write the failing test for the PRNG**

`data/test/rng.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../generator/rng.js'

test('makeRng is deterministic for a given seed', () => {
  const a = makeRng(42)
  const b = makeRng(42)
  const seqA = Array.from({ length: 8 }, () => a.next())
  const seqB = Array.from({ length: 8 }, () => b.next())
  assert.deepEqual(seqA, seqB)
})

test('different seeds produce different sequences', () => {
  const a = makeRng(1).next()
  const b = makeRng(2).next()
  assert.notEqual(a, b)
})

test('helpers stay in range and are reproducible', () => {
  const r = makeRng(7)
  for (let i = 0; i < 100; i++) {
    const n = r.int(3, 9)
    assert.ok(n >= 3 && n <= 9 && Number.isInteger(n))
  }
  const r1 = makeRng(7); const r2 = makeRng(7)
  assert.deepEqual(r1.shuffle([1, 2, 3, 4, 5]), r2.shuffle([1, 2, 3, 4, 5]))
  assert.equal(typeof r1.pick(['x', 'y']), 'string')
  assert.equal(typeof r1.bool(0.5), 'boolean')
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd data && npm install && node --test test/rng.test.js`
Expected: FAIL — `Cannot find module '../generator/rng.js'`.

- [ ] **Step 5: Implement `data/generator/rng.js`**

```js
// mulberry32 — small, fast, deterministic 32-bit PRNG. Good enough for demo data.
export function makeRng (seed) {
  let a = seed >>> 0
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      const out = arr.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
    weighted: (pairs) => { // pairs: [[item, weight], ...]
      const total = pairs.reduce((s, [, w]) => s + w, 0)
      let x = next() * total
      for (const [item, w] of pairs) { if ((x -= w) < 0) return item }
      return pairs[pairs.length - 1][0]
    },
    bool: (p = 0.5) => next() < p,
  }
}
```

- [ ] **Step 6: Implement `data/generator/db.js`**

```js
import mysql from 'mysql2/promise'
import { config } from './env.js'

export async function withDb (fn) {
  const conn = await mysql.createConnection({
    host: config.db.host, port: config.db.port,
    user: config.db.user, password: config.db.password,
    database: config.db.database, multipleStatements: false,
  })
  try { return await fn(conn) } finally { await conn.end() }
}

// Generic bulk insert. All rows must share the same key set; keys are exact column names.
export async function insertRows (conn, table, rows) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const colSql = cols.map(c => '`' + c + '`').join(',')
  const values = rows.map(r => cols.map(c => (r[c] === undefined ? null : r[c])))
  await conn.query('INSERT INTO `' + table + '` (' + colSql + ') VALUES ?', [values])
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd data && node --test test/rng.test.js`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add data/package.json data/package-lock.json data/generator/env.js data/generator/rng.js data/generator/db.js data/test/rng.test.js
git commit -m "feat(data): scaffold demo-data package — env, seeded PRNG, db helper"
```

---

### Task 2: Finalize `content/services.json` and `content/destinations.json`

The themed lore was generated into the session scratchpad. This task copies it into the repo as committed source and pins its shape with a validation test. (Paths: `/tmp/claude-1000/-home-cdaley-gits-github-tvcri-village-green/a06051be-79d7-4069-88f2-7d65a5463a1d/scratchpad/lore-services.json` and `…/lore-destinations.json`.)

**Files:**
- Create: `data/content/services.json`
- Create: `data/content/destinations.json`
- Test: `data/test/content.test.js`

**Interfaces:**
- Produces: `content/services.json` = `{ serviceNames:[{serviceName,capability,flavor}], transportationTypes:[string], householdChores:[string], fcvActivities:{contactTypes:[string],activityTypes:[string],sampleNotes:[string]}, memberDropReasons:[string], vettingTypes:[{type,flavor}], disabilities:[string] }`. `content/destinations.json` = `{ destinations:[{name,category,town,note}], miskatonicHealth:[{name,category,town,note}] }`.

- [ ] **Step 1: Copy the two scratch packs into `data/content/`**

```bash
mkdir -p data/content
SCRATCH=/tmp/claude-1000/-home-cdaley-gits-github-tvcri-village-green/a06051be-79d7-4069-88f2-7d65a5463a1d/scratchpad
cp "$SCRATCH/lore-services.json" data/content/services.json
cp "$SCRATCH/lore-destinations.json" data/content/destinations.json
```

- [ ] **Step 2: Write the failing validation test**

`data/test/content.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const load = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../content/${name}`, import.meta.url)), 'utf8'))

// The 13 capability names every serviceName.capability must match.
const CAPS = new Set(['Circles', 'Errands', 'Friends', 'Governance', 'Healthcare Support',
  'Home Help', 'New Member Intake', 'Office Services', 'Rides', 'Safety Net',
  'Service Referrals', 'Tech Support', 'Village Affiliation'])

test('services.json has the expected shape and valid capabilities', () => {
  const s = load('services.json')
  assert.ok(Array.isArray(s.serviceNames) && s.serviceNames.length >= 40)
  for (const sn of s.serviceNames) {
    assert.equal(typeof sn.serviceName, 'string')
    assert.ok(CAPS.has(sn.capability), `bad capability: ${sn.capability}`)
  }
  assert.ok(Array.isArray(s.transportationTypes) && s.transportationTypes.length >= 4)
  assert.ok(Array.isArray(s.memberDropReasons) && s.memberDropReasons.length >= 5)
  assert.ok(Array.isArray(s.vettingTypes) && s.vettingTypes.length >= 3)
  assert.ok(Array.isArray(s.disabilities) && s.disabilities.length >= 5)
  assert.ok(s.fcvActivities && Array.isArray(s.fcvActivities.contactTypes))
  assert.ok(Array.isArray(s.fcvActivities.activityTypes))
})

test('destinations.json has destinations and the Miskatonic Health network', () => {
  const d = load('destinations.json')
  assert.ok(Array.isArray(d.destinations) && d.destinations.length >= 40)
  for (const dest of d.destinations) {
    assert.equal(typeof dest.name, 'string')
    assert.equal(typeof dest.category, 'string')
  }
  assert.ok(Array.isArray(d.miskatonicHealth) && d.miskatonicHealth.length >= 15)
})
```

- [ ] **Step 3: Run the test to verify it passes (the packs already match)**

Run: `cd data && node --test test/content.test.js`
Expected: PASS. If the `vettingTypes` entries are objects with a `type` key the test reads `vt.type` nowhere — fine. If any `serviceName.capability` fails, hand-fix that entry in `data/content/services.json` to one of the 13 names, then re-run.

- [ ] **Step 4: Commit**

```bash
git add data/content/services.json data/content/destinations.json data/test/content.test.js
git commit -m "feat(data): finalize services + destinations content packs"
```

---

### Task 3: Expand the people roster to ~300 and finalize `content/people.json`

The initial pack has 57 figures. Expand to ~300 **real** figures via a fan-out of category subagents, then merge, de-dupe by `name`, tag each `gag` or `background`, and pin the result with a test. (Initial pack: `…/scratchpad/lore-people.json`, shape `{ figures:[{name,bucket,realBlurb,gag?}], loginPersonas:[...] }`.)

**Files:**
- Create: `data/content/people.json`
- Modify: `data/test/content.test.js` (add people assertions)

**Interfaces:**
- Produces: `content/people.json` = `{ figures: [{ name, bucket, realBlurb, tag: 'gag'|'background', villageHint?: string, gag?: { serviceName, destination, description } }], loginPersonas: [{ name, username, suggestedRole: 'owner'|'manage'|'full'|'restricted', privileges?: string[], villages?: string[], rationale }] }`. Every `name` is globally unique. Figures tagged `gag` MUST have a `gag` object.

- [ ] **Step 1: Dispatch the category subagents (fan-out) to source new figures**

Dispatch these as parallel subagents (general-purpose, web allowed). Each MUST return real, documented people/characters with a one-line `realBlurb`, may include a `villageHint` (one of: Quahog, Arkham, Innsmouth, Kingsport, Dunwich, Providence, Newport, Chepachet, Pawtuxet, "Cabinet, RI"), and tag each `gag` (with a `{serviceName,destination,description}` riff) or `background`. Target counts are guidance; real-and-recognizable beats hitting a number. Write each result to `data/content/_pack-<category>.json` as `{figures:[...]}`.

- `colonial-historical` (~35): colonial settlers, Gaspee raiders, Revolutionary figures, RI founders, abolitionists, sea captains, mill owners.
- `gilded-age-newport` (~30): Vanderbilts/Astors/Belmonts, mansion builders, Ocean Drive society, Doris Duke, servants with real names.
- `politics-crime` (~25): RI governors/mayors/senators (Cianci, Chafee, Pell, Dorr), Patriarca-era figures, judges.
- `arts-music-lit` (~35): RISD/Brown figures, Talking Heads/Byrne, Spalding Gray, Poe-in-Providence, Lovecraft circle, Cormac McCarthy, Galway Kinnell, Providence music scene.
- `sports` (~25): RI/New England athletes, Pawtucket Red Sox lore, Newport tennis Hall of Fame, boxers, sailors (America's Cup).
- `oddballs-legends` (~30): Mercy Brown, Little Bett, the Conjuring/Perron family, the Secret Mall Apartment crew, Big Blue Bug, Mr. Potato Head, Alan Shawn Feinstein, local-TV personalities, roadside legends.
- `fictional-ri` (~30): full Family Guy cast (Quahog), Lovecraft characters (Innsmouth/Arkham/Dunwich/Kingsport), Conjuring characters, Family-Guy-adjacent.
- `nearby-new-england` (~25): just-over-the-border notables (Lizzie Borden/Fall River, Robert Goddard, New Bedford whaling, Worcester/Boston icons) — used sparingly.

- [ ] **Step 2: Merge packs + the initial 57, de-dupe, tag, validate — write `content/people.json`**

Write a one-off merge in `data/content/_merge.mjs` (a throwaway script; do not commit it). It must: read `lore-people.json` (initial) + all `_pack-*.json`; concatenate `figures`; drop duplicates by case-insensitive `name` (keep the richest entry — prefer one with a `gag`); set `tag = gag ? 'gag' : 'background'`; carry `loginPersonas` from the initial pack (augment if a pack proposes owners/mayors); assert `figures.length >= 280` and `figures.filter(f=>f.tag==='gag').length >= 80`; write pretty JSON to `data/content/people.json`. Then delete the `_pack-*.json` and `_merge.mjs` scratch files.

```bash
cd data && node content/_merge.mjs && rm -f content/_pack-*.json content/_merge.mjs
```

- [ ] **Step 3: Add people assertions to `data/test/content.test.js`**

```js
test('people.json is a large, de-duped, tagged roster', () => {
  const p = load('people.json')
  assert.ok(Array.isArray(p.figures) && p.figures.length >= 280, `figures=${p.figures.length}`)
  const names = p.figures.map(f => f.name.toLowerCase())
  assert.equal(names.length, new Set(names).size, 'figure names must be globally unique')
  const gags = p.figures.filter(f => f.tag === 'gag')
  assert.ok(gags.length >= 80, `gag cameos=${gags.length}`)
  for (const g of gags) {
    assert.ok(g.gag && g.gag.serviceName && g.gag.destination, `gag missing fields: ${g.name}`)
  }
  for (const f of p.figures) assert.ok(f.tag === 'gag' || f.tag === 'background')
  assert.ok(Array.isArray(p.loginPersonas) && p.loginPersonas.length >= 12)
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd data && node --test test/content.test.js`
Expected: PASS. If `figures.length < 280`, re-run/add a subagent category; if a gag lacks fields, fix that figure in `people.json`.

- [ ] **Step 5: Commit**

```bash
git add data/content/people.json data/test/content.test.js
git commit -m "feat(data): expand RI cameo roster to ~300 real figures"
```

---

### Task 4: `constants.js` + village/user/grant builder

**Files:**
- Create: `data/generator/constants.js`
- Create: `data/generator/builders/villages.js`
- Test: `data/test/data.test.js`

**Interfaces:**
- Produces: `constants.js` exports `CAPABILITIES` (`[{id,name}]` with static ids), `VILLAGES` (`[{ name, size: 'big'|'medium'|'small'|'tiny', theme }]`, 10 entries), `ROLE` (`{ restricted:1, full:2, manage:3, owner:4 }`), `TABLE_ORDER` (parent-first array of table names for inserts). `builders/villages.js` exports `buildVillagesAndUsers(content, rng) -> { village, user_data, village_grant }` where each returned array holds canonical row objects, and village rows are `{ id, name }` with `id` = 1-based index. Also returns a `byName` map `{ villageName -> id }` for downstream builders via the third return field: `{ village, user_data, village_grant, villageIdByName }`.

- [ ] **Step 1: Create `data/generator/constants.js`**

```js
// capability ids are FIXED by the static migration seed — reference these exact ids.
export const CAPABILITIES = [
  { id: 1, name: 'Errands' }, { id: 2, name: 'Friends' }, { id: 3, name: 'Home Help' },
  { id: 4, name: 'Tech Support' }, { id: 5, name: 'Rides' }, { id: 6, name: 'Circles' },
  { id: 9, name: 'Governance' }, { id: 10, name: 'Healthcare Support' },
  { id: 12, name: 'New Member Intake' }, { id: 13, name: 'Office Services' },
  { id: 15, name: 'Safety Net' }, { id: 16, name: 'Service Referrals' },
  { id: 18, name: 'Village Affiliation' },
]

export const ROLE = { restricted: 1, full: 2, manage: 3, owner: 4 }

// 10 villages; the two 'big' ones must reach 50+ members AND 50+ volunteers.
export const VILLAGES = [
  { name: 'Arkham', size: 'big', theme: 'lovecraft-health' },
  { name: 'Quahog', size: 'big', theme: 'family-guy' },
  { name: 'Providence', size: 'medium', theme: 'providence' },
  { name: 'Newport', size: 'medium', theme: 'gilded-age' },
  { name: 'Innsmouth', size: 'small', theme: 'lovecraft' },
  { name: 'Kingsport', size: 'small', theme: 'lovecraft' },
  { name: 'Dunwich', size: 'small', theme: 'lovecraft' },
  { name: 'Chepachet', size: 'small', theme: 'chepachet' },
  { name: 'Pawtuxet', size: 'small', theme: 'gaspee' },
  { name: 'Cabinet, RI', size: 'tiny', theme: 'made-up' },
]

// Parent-before-child insert order (FK checks are disabled during load, but stay tidy).
export const TABLE_ORDER = [
  'village', 'user_data', 'village_grant',
  'capability', 'disability', 'vetting_type',
  'person', 'member', 'volunteer',
  'volunteer_capability', 'volunteer_vetting', 'person_disability',
  'service_request', 'notification_event', 'fcv_submission',
]
```

- [ ] **Step 2: Write the failing test for villages/users/grants**

Add to `data/test/data.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { makeRng } from '../generator/rng.js'
import { VILLAGES, ROLE } from '../generator/constants.js'
import { buildVillagesAndUsers } from '../generator/builders/villages.js'

const content = {
  people: JSON.parse(readFileSync(fileURLToPath(new URL('../content/people.json', import.meta.url)), 'utf8')),
}

test('villages: 10 villages with 1-based ids', () => {
  const { village, villageIdByName } = buildVillagesAndUsers(content, makeRng(1))
  assert.equal(village.length, 10)
  assert.equal(village[0].id, 1)
  assert.equal(villageIdByName[VILLAGES[0].name], 1)
})

test('users/grants: admin, multi-village coordinator, and zero-grants user exist', () => {
  const { user_data, village_grant } = buildVillagesAndUsers(content, makeRng(1))
  // every grant references a real user and a village in 1..10, role 1..4
  const userIds = new Set(user_data.map(u => u.userId))
  for (const g of village_grant) {
    assert.ok(userIds.has(g.userId))
    assert.ok(g.villageId >= 1 && g.villageId <= 10)
    assert.ok(g.roleId >= 1 && g.roleId <= 4)
  }
  // a coordinator with grants in >= 3 villages (meta roll-up)
  const byUser = {}
  for (const g of village_grant) (byUser[g.userId] ||= new Set()).add(g.villageId)
  assert.ok(Object.values(byUser).some(s => s.size >= 3), 'need a 3+ village coordinator')
  // at least one user with no grants at all
  assert.ok(user_data.some(u => !village_grant.some(g => g.userId === u.userId)), 'need a zero-grants user')
  // every role value appears somewhere
  const roles = new Set(village_grant.map(g => g.roleId))
  for (const r of Object.values(ROLE)) assert.ok(roles.has(r), `missing role ${r}`)
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd data && node --test test/data.test.js`
Expected: FAIL — `Cannot find module '../generator/builders/villages.js'`.

- [ ] **Step 4: Implement `data/generator/builders/villages.js`**

```js
import { VILLAGES, ROLE } from '../constants.js'

// Build villages, demo login users, and their grants from content.people.loginPersonas
// plus a few synthesized per-village coordinators. Deterministic given rng.
export function buildVillagesAndUsers (content, rng) {
  const village = VILLAGES.map((v, i) => ({ id: i + 1, name: v.name }))
  const villageIdByName = Object.fromEntries(village.map(v => [v.name, v.id]))

  const user_data = []
  const village_grant = []
  let userId = 0
  const addUser = (username, claims) => {
    userId += 1
    user_data.push({ userId, username, lastClaims: JSON.stringify(claims || {}) })
    return userId
  }
  const grant = (uid, villageName, roleId) =>
    village_grant.push({ villageId: villageIdByName[villageName], userId: uid, roleId })

  // 1) System admin — admin privilege, NO grants (sees all via elevate).
  addUser('samuel.slater@millworks.test', { realm_access: { roles: ['admin'] } })

  // 2) An owner for each of the two big villages.
  grant(addUser('roger.williams@providence.test'), 'Arkham', ROLE.owner)
  grant(addUser('hp.lovecraft@miskatonic.test'), 'Arkham', ROLE.full)
  grant(addUser('peter.griffin@quahog.test'), 'Quahog', ROLE.owner)

  // 3) A multi-village regional coordinator (>= 3 villages -> meta roll-up).
  const coord = addUser('john.brown@brownbros.test')
  for (const v of ['Quahog', 'Innsmouth', 'Arkham']) grant(coord, v, ROLE.full)

  // 4) One of each remaining role somewhere.
  grant(addUser('nathanael.greene@newport.test'), 'Newport', ROLE.manage)
  grant(addUser('gilbert.stuart@gmail.test'), 'Quahog', ROLE.restricted)

  // 5) A coordinator (full) for every other village so each has a steward.
  const stewards = {
    Providence: 'ann.franklin@providence.test', Newport: 'ida.lewis@lighthouse.test',
    Innsmouth: 'obed.marsh@innsmouth.test', Kingsport: 'richard.pickman@kingsport.test',
    Dunwich: 'wilbur.whateley@dunwich.test', Chepachet: 'betty.bett@chepachet.test',
    Pawtuxet: 'abraham.whipple@pawtuxet.test', 'Cabinet, RI': 'roger.mowry@cabinet.test',
  }
  for (const [vname, username] of Object.entries(stewards)) grant(addUser(username), vname, ROLE.full)

  // 6) A zero-grants user (valid login, sees nothing).
  addUser('mr.calimari@quahog.test')

  return { village, user_data, village_grant, villageIdByName }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd data && node --test test/data.test.js`
Expected: PASS (the 3 tests so far).

- [ ] **Step 6: Commit**

```bash
git add data/generator/constants.js data/generator/builders/villages.js data/test/data.test.js
git commit -m "feat(data): villages + demo users/grants builder"
```

---

### Task 5: Person, member, volunteer + lookups/junctions builders

Distributes the figure pool into per-village `person` rows (themed by village), then derives `member` and (mostly distinct) `volunteer` rows, capability/vetting/disability lookups, and their junctions.

**Files:**
- Create: `data/generator/builders/persons.js`
- Create: `data/generator/builders/membership.js`
- Modify: `data/test/data.test.js`

**Interfaces:**
- Consumes: `villageIdByName` and `CAPABILITIES` from earlier; `content.people.figures`, `content.services` (for `vettingTypes`, `disabilities`, `memberDropReasons`).
- Produces:
  - `buildPersons(content, villageIdByName, rng) -> { person, byVillage }` where `person` rows match the canonical shape (no `address` key) with 1-based `id`; `byVillage` is `{ villageId -> { members:[personId...], volunteers:[personId...] } }` (the planned role split per person, mostly distinct, ~10% overlap).
  - `buildMembership(personPlan, content, rng) -> { member, volunteer, disability, vetting_type, volunteer_capability, volunteer_vetting, person_disability }`. `member.status` mostly `'Active'`; a slice inactive with `drop_reason`. `volunteer.active` mostly `1`; a slice `0`. `capability` table itself comes from `CAPABILITIES` (added in data.js, Task 6).

- [ ] **Step 1: Write failing tests for persons + membership invariants**

Add to `data/test/data.test.js`:

```js
import { buildPersons } from '../generator/builders/persons.js'
import { buildMembership } from '../generator/builders/membership.js'

const services = JSON.parse(readFileSync(fileURLToPath(new URL('../content/services.json', import.meta.url)), 'utf8'))
const fullContent = { people: content.people, services }

test('persons: no address key, unique (village,name), themed big villages', () => {
  const { village, villageIdByName } = buildVillagesAndUsers(fullContent, makeRng(1))
  const { person, byVillage } = buildPersons(fullContent, villageIdByName, makeRng(1))
  for (const p of person) {
    assert.ok(!('address' in p), 'person rows must not set the generated address column')
    assert.equal(typeof p.full_name, 'string')
    assert.ok(p.village_id >= 1 && p.village_id <= 10)
  }
  // unique (village_id, full_name)
  const keys = person.map(p => `${p.village_id}::${p.full_name.toLowerCase()}`)
  assert.equal(keys.length, new Set(keys).size)
  // big villages (Arkham=1, Quahog=2) each have >=50 members and >=50 volunteers
  for (const vid of [villageIdByName['Arkham'], villageIdByName['Quahog']]) {
    assert.ok(byVillage[vid].members.length >= 50, `members in ${vid}`)
    assert.ok(byVillage[vid].volunteers.length >= 50, `volunteers in ${vid}`)
  }
})

test('membership: status/active invariants and <=10% member/volunteer overlap', () => {
  const { villageIdByName } = buildVillagesAndUsers(fullContent, makeRng(1))
  const { person, byVillage } = buildPersons(fullContent, villageIdByName, makeRng(1))
  const m = buildMembership({ person, byVillage }, fullContent, makeRng(1))
  const personIds = new Set(person.map(p => p.id))

  for (const row of m.member) {
    assert.ok(personIds.has(row.person_id))
    assert.equal(typeof row.status, 'string')
    if (row.status !== 'Active') assert.ok(row.drop_reason, 'inactive members need a drop_reason')
  }
  assert.ok(m.member.some(r => r.status === 'Active'))
  assert.ok(m.member.some(r => r.status !== 'Active'))

  for (const row of m.volunteer) {
    assert.ok(personIds.has(row.person_id))
    assert.ok(row.active === 0 || row.active === 1)
  }
  assert.ok(m.volunteer.some(r => r.active === 1) && m.volunteer.some(r => r.active === 0))

  // overlap: persons who are BOTH member and volunteer <= 10% of volunteers
  const memberPersons = new Set(m.member.map(r => r.person_id))
  const both = m.volunteer.filter(r => memberPersons.has(r.person_id)).length
  assert.ok(both <= Math.ceil(m.volunteer.length * 0.10), `overlap ${both}/${m.volunteer.length}`)

  // junctions reference valid parents
  const volIds = new Set(m.volunteer.map(v => v.id))
  for (const vc of m.volunteer_capability) assert.ok(volIds.has(vc.volunteer_id))
  for (const vv of m.volunteer_vetting) assert.ok(volIds.has(vv.volunteer_id))
  const disIds = new Set(m.disability.map(d => d.id))
  for (const pd of m.person_disability) assert.ok(disIds.has(pd.disability_id) && personIds.has(pd.person_id))
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd data && node --test test/data.test.js`
Expected: FAIL — `Cannot find module '../generator/builders/persons.js'`.

- [ ] **Step 3: Implement `data/generator/builders/persons.js`**

```js
import { VILLAGES } from '../constants.js'

// Target member/volunteer counts per village size. Members and volunteers are
// mostly DISTINCT people (members receive services; volunteers provide them).
const SIZE = {
  big: { members: 55, volunteers: 52 },
  medium: { members: 20, volunteers: 14 },
  small: { members: 9, volunteers: 6 },
  tiny: { members: 4, volunteers: 3 },
}

const RI_STREETS = ['Benefit St', 'Thayer St', 'Hope St', 'Wickenden St', 'Atwells Ave',
  'Westminster St', 'Spooner St', 'Water St', 'Bellevue Ave', 'Ocean Dr', 'Federal Hill',
  'Angell St', 'Power St', 'College St', 'Elmgrove Ave', 'Broadway', 'Smith St']
const RI_TOWNS = { Arkham: 'Arkham', Quahog: 'Quahog', Providence: 'Providence',
  Newport: 'Newport', Innsmouth: 'Innsmouth', Kingsport: 'Kingsport', Dunwich: 'Dunwich',
  Chepachet: 'Chepachet', Pawtuxet: 'Warwick', 'Cabinet, RI': 'Glocester' }

// Which figure buckets/villageHints belong to which village theme.
function poolForVillage (vName, theme, figures, used, rng) {
  const avail = figures.filter(f => !used.has(f.name))
  const hinted = avail.filter(f => f.villageHint === vName)
  let themed = []
  if (theme === 'family-guy') themed = avail.filter(f => f.bucket === 'fictional-ri' && /quahog|griffin|family guy/i.test(f.realBlurb || ''))
  else if (theme.startsWith('lovecraft')) themed = avail.filter(f => /lovecraft|innsmouth|arkham|dunwich|kingsport|cthulhu|miskatonic/i.test((f.realBlurb || '') + f.bucket))
  else if (theme === 'gilded-age') themed = avail.filter(f => f.bucket === 'gilded-age-newport')
  // hinted first, then themed, then anyone — caller slices what it needs
  return [...rng.shuffle(hinted), ...rng.shuffle(themed), ...rng.shuffle(avail)]
}

export function buildPersons (content, villageIdByName, rng) {
  const figures = content.people.figures
  const used = new Set()
  const person = []
  const byVillage = {}
  let pid = 0

  const splitName = (name) => {
    const parts = name.replace(/[^A-Za-z .'-]/g, '').split(/\s+/).filter(Boolean)
    return { first: parts[0] || name, last: parts.length > 1 ? parts[parts.length - 1] : '' }
  }
  const emailFor = (name) => name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@residents.test'

  const makePerson = (fig, villageId, vName) => {
    pid += 1
    const { first, last } = splitName(fig.name)
    used.add(fig.name)
    person.push({
      id: pid, village_id: villageId, full_name: fig.name,
      first_name: first, last_name: last, nickname: null,
      street: `${rng.int(1, 400)} ${rng.pick(RI_STREETS)}`, unit: rng.bool(0.15) ? `Apt ${rng.int(1, 30)}` : null,
      city: RI_TOWNS[vName] || vName, state: 'RI', zip: String(rng.int(2801, 2920)).padStart(5, '0'),
      email: emailFor(fig.name), phone: `401-555-${String(rng.int(100, 999))}`, cell: `401-555-${String(rng.int(100, 999))}`,
      computer_use: rng.bool(0.6) ? 1 : 0, smartphone: rng.bool(0.7) ? 1 : 0,
      birth_date: `19${rng.int(30, 60)}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
      emergency_contact_name: null, emergency_contact_relationship: null,
      emergency_contact_phone: null, emergency_contact_email: null,
      comments: fig.realBlurb || null,
    })
    return pid
  }

  for (const v of VILLAGES) {
    const villageId = villageIdByName[v.name]
    const target = SIZE[v.size]
    const pool = poolForVillage(v.name, v.theme, figures, used, rng)
    const members = []
    const volunteers = []
    let i = 0
    // members
    for (let k = 0; k < target.members && i < pool.length; k++, i++) members.push(makePerson(pool[i], villageId, v.name))
    // volunteers — mostly new people; ~10% reuse a member person
    for (let k = 0; k < target.volunteers; k++) {
      if (rng.bool(0.10) && members.length) { volunteers.push(rng.pick(members)); continue }
      if (i >= pool.length) break
      volunteers.push(makePerson(pool[i++], villageId, v.name))
    }
    byVillage[villageId] = { members, volunteers }
  }
  return { person, byVillage }
}
```

- [ ] **Step 4: Implement `data/generator/builders/membership.js`**

```js
import { BASE_DATE } from '../env.js'
import { CAPABILITIES } from '../constants.js'

const isoDate = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => new Date(d.getTime() + n * 86400000)

export function buildMembership (plan, content, rng) {
  const { person, byVillage } = plan
  const personById = Object.fromEntries(person.map(p => [p.id, p]))

  // Lookup tables (capability is fixed; disability/vetting_type are demo-seeded from content.services).
  const disability = content.services.disabilities.map((name, i) => ({ id: i + 1, name }))
  const vetting_type = content.services.vettingTypes.map((v, i) => ({ id: i + 1, name: v.type || v }))
  const dropReasons = content.services.memberDropReasons

  const member = []
  const volunteer = []
  const volunteer_capability = []
  const volunteer_vetting = []
  const person_disability = []
  let mId = 0; let vId = 0; let vcId = 0; let vvId = 0; let pdId = 0

  for (const vid of Object.keys(byVillage).map(Number)) {
    const { members, volunteers } = byVillage[vid]

    // members (de-dupe person ids within the village's member list)
    for (const personId of [...new Set(members)]) {
      mId += 1
      const inactive = rng.bool(0.12)
      member.push({
        id: mId, person_id: personId,
        member_number: `M-${String(vid).padStart(2, '0')}${String(mId).padStart(4, '0')}`,
        member_type: rng.pick(['Individual', 'Household']), primary_person_id: null,
        secondary_type: null, join_date: isoDate(addDays(BASE_DATE, -rng.int(30, 3000))),
        status: inactive ? rng.pick(['Inactive', 'Dropped']) : 'Active',
        drop_reason: inactive ? rng.pick(dropReasons) : null,
        household_size: rng.int(1, 2),
      })
    }
    // ~1 household per village: link a second member to a primary as 'Spouse'
    const villageMembers = member.filter(r => members.includes(r.person_id))
    if (villageMembers.length >= 2 && rng.bool(0.8)) {
      const [primary, secondary] = rng.shuffle(villageMembers).slice(0, 2)
      secondary.primary_person_id = primary.person_id
      secondary.secondary_type = 'Spouse'
      secondary.household_size = 2; primary.household_size = 2
    }

    // volunteers
    for (const personId of [...new Set(volunteers)]) {
      vId += 1
      const active = rng.bool(0.88) ? 1 : 0
      volunteer.push({ id: vId, person_id: personId, provider_type: rng.pick(['Individual', 'Couple', 'Agency']), active })
      // 1-3 capabilities
      const caps = rng.shuffle(CAPABILITIES).slice(0, rng.int(1, 3))
      for (const c of caps) { vcId += 1; volunteer_capability.push({ id: vcId, volunteer_id: vId, capability_id: c.id }) }
      // ~40% have a vetting record (some expired)
      if (rng.bool(0.4) && vetting_type.length) {
        vvId += 1
        const entered = addDays(BASE_DATE, -rng.int(60, 1500))
        const expired = rng.bool(0.3) ? addDays(entered, 365) : addDays(BASE_DATE, rng.int(60, 700))
        volunteer_vetting.push({ id: vvId, volunteer_id: vId, vetting_type_id: rng.pick(vetting_type).id, date_entered: isoDate(entered), date_expired: isoDate(expired) })
      }
    }
  }

  // ~handful of disabilities across members
  const memberPersonIds = [...new Set(member.map(m => m.person_id))]
  for (const personId of rng.shuffle(memberPersonIds).slice(0, Math.min(12, memberPersonIds.length))) {
    pdId += 1; person_disability.push({ id: pdId, person_id: personId, disability_id: rng.pick(disability).id })
  }

  return { member, volunteer, disability, vetting_type, volunteer_capability, volunteer_vetting, person_disability }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd data && node --test test/data.test.js`
Expected: PASS. If the big-village volunteer count test fails, raise `SIZE.big.volunteers` or widen the figure pool (Task 3 count).

- [ ] **Step 6: Commit**

```bash
git add data/generator/builders/persons.js data/generator/builders/membership.js data/test/data.test.js
git commit -m "feat(data): person + membership builders (members/volunteers/lookups/junctions)"
```

---

### Task 6: Service requests, notifications, FCV + `data.js` orchestrator

**Files:**
- Create: `data/generator/builders/requests.js`
- Create: `data/generator/data.js`
- Modify: `data/test/data.test.js`

**Interfaces:**
- Consumes: persons + `byVillage` + member/volunteer arrays; `content.services` (serviceNames, transportationTypes, fcvActivities), `content.destinations`, `content.people` (gag cameos).
- Produces:
  - `buildRequests(plan, membership, content, rng) -> { service_request, notification_event, fcv_submission }`. Honors `deriveStatus`: `Confirmed`/`Completed` rows have `volunteer_person_id` set; `Open` rows do not. Each `gag` cameo who is a member gets one bespoke request.
  - `buildDataset(content, seed) -> dataset` (the full canonical object incl. `capability` from `CAPABILITIES`). This is the single entry point both loaders call.

- [ ] **Step 1: Write failing tests for requests + the whole dataset**

Add to `data/test/data.test.js`:

```js
import { buildDataset } from '../generator/data.js'

test('service requests honor deriveStatus and reference valid people', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  const personIds = new Set(ds.person.map(p => p.id))
  const villageIds = new Set(ds.village.map(v => v.id))
  const statuses = new Set(['Draft', 'Open', 'Confirmed', 'Completed', 'Member cancelled', 'Volunteer cancelled', 'Hub cancelled'])
  for (const sr of ds.service_request) {
    assert.ok(villageIds.has(sr.village_id))
    assert.ok(statuses.has(sr.status), `bad status ${sr.status}`)
    if (sr.status === 'Confirmed' || sr.status === 'Completed') assert.ok(sr.volunteer_person_id, `${sr.status} needs a volunteer`)
    if (sr.status === 'Open') assert.equal(sr.volunteer_person_id, null)
    if (sr.member_person_id) assert.ok(personIds.has(sr.member_person_id))
    if (sr.volunteer_person_id) assert.ok(personIds.has(sr.volunteer_person_id))
  }
  // a spread of statuses is present
  const seen = new Set(ds.service_request.map(s => s.status))
  for (const s of ['Open', 'Confirmed', 'Completed', 'Draft']) assert.ok(seen.has(s), `missing status ${s}`)
})

test('notifications reference requests; recipients is a JSON string', () => {
  const ds = buildDataset(fullContentWithDest(), 20260630)
  const srIds = new Set(ds.service_request.map(s => s.id))
  for (const n of ds.notification_event) {
    assert.ok(srIds.has(n.service_request_id))
    assert.equal(typeof n.recipients, 'string')
    assert.doesNotThrow(() => JSON.parse(n.recipients))
  }
})

test('buildDataset is deterministic and complete', () => {
  const a = buildDataset(fullContentWithDest(), 20260630)
  const b = buildDataset(fullContentWithDest(), 20260630)
  assert.deepEqual(a, b)
  assert.equal(a.capability.length, 13)
  assert.ok(a.person.length >= 250)
  assert.ok(a.service_request.length >= 200)
  assert.ok(a.fcv_submission.length >= 30)
})

// helper used by these tests
function fullContentWithDest () {
  const destinations = JSON.parse(readFileSync(fileURLToPath(new URL('../content/destinations.json', import.meta.url)), 'utf8'))
  return { people: content.people, services, destinations }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd data && node --test test/data.test.js`
Expected: FAIL — `Cannot find module '../generator/data.js'`.

- [ ] **Step 3: Implement `data/generator/builders/requests.js`**

```js
import { BASE_DATE } from '../env.js'

const dt = (d) => d.toISOString().slice(0, 19).replace('T', ' ')
const addDays = (d, n) => new Date(d.getTime() + n * 86400000)

// status weights -> ~40% Open, ~30% Confirmed, ~15% Completed, ~10% Draft, ~5% cancelled
const STATUS_W = [['Open', 40], ['Confirmed', 30], ['Completed', 15], ['Draft', 10],
  ['Member cancelled', 2], ['Volunteer cancelled', 2], ['Hub cancelled', 1]]
const CANCELLED = new Set(['Member cancelled', 'Volunteer cancelled', 'Hub cancelled'])

export function buildRequests (plan, membership, content, rng) {
  const { byVillage } = plan
  const personById = Object.fromEntries(plan.person.map(p => [p.id, p]))
  const allDest = [...content.destinations.destinations, ...content.destinations.miskatonicHealth]
  const services = content.services.serviceNames
  const transports = content.services.transportationTypes
  const gagFigures = content.people.figures.filter(f => f.tag === 'gag')
  // map a gag figure to a member person row by name
  const personByName = Object.fromEntries(plan.person.map(p => [p.full_name.toLowerCase(), p]))
  const memberPersonIds = new Set(membership.member.map(m => m.person_id))

  const service_request = []
  const notification_event = []
  const fcv_submission = []
  let srId = 0; let neId = 0; let fcvId = 0; let reqNo = 100

  const pushNotifications = (sr) => {
    const recips = JSON.stringify([sr.member_person_id, sr.volunteer_person_id].filter(Boolean))
    const events = []
    if (sr.status === 'Open' || sr.status === 'Confirmed' || sr.status === 'Completed' || CANCELLED.has(sr.status)) events.push('open')
    if (sr.status === 'Confirmed' || sr.status === 'Completed') events.push('confirmed')
    if (CANCELLED.has(sr.status)) events.push('cancelled')
    for (const et of events) {
      neId += 1
      notification_event.push({ id: neId, event_type: et, service_request_id: sr.id,
        created_at: dt(addDays(BASE_DATE, -rng.int(1, 60))), sent_at: dt(addDays(BASE_DATE, -rng.int(1, 60))), recipients: recips })
    }
  }

  const makeRequest = (villageId, memberPersonId, opts = {}) => {
    srId += 1; reqNo += 1
    const status = opts.status || rng.weighted(STATUS_W)
    const wantsVol = status === 'Confirmed' || status === 'Completed' || (status === 'Draft' && rng.bool(0.3)) || CANCELLED.has(status) && rng.bool(0.5)
    const vols = byVillage[villageId].volunteers
    const volunteerPersonId = status === 'Open' ? null : (wantsVol && vols.length ? rng.pick(vols) : null)
    const past = status === 'Completed' || CANCELLED.has(status)
    const finish = addDays(BASE_DATE, past ? -rng.int(1, 120) : rng.int(1, 45))
    const svc = opts.serviceName ? { serviceName: opts.serviceName, capability: 'Rides' } : rng.pick(services)
    service_request.push({
      id: srId, request_number: reqNo, village_id: villageId,
      member_person_id: memberPersonId, volunteer_person_id: volunteerPersonId, status,
      service_name: svc.serviceName, transportation_type: rng.pick(transports),
      destination: opts.destination || rng.pick(allDest).name,
      created_at: dt(addDays(finish, -rng.int(1, 14))), start_at: dt(finish), finish_at: dt(finish),
      instructions: opts.description || svc.flavor || null,
      description: opts.description || null,
    })
    pushNotifications(service_request[service_request.length - 1])
  }

  // 1) Bespoke gag requests for gag cameos who landed as members.
  for (const fig of gagFigures) {
    const p = personByName[fig.name.toLowerCase()]
    if (!p || !memberPersonIds.has(p.id)) continue
    makeRequest(p.village_id, p.id, {
      status: rng.weighted([['Open', 3], ['Confirmed', 3], ['Completed', 2], ['Draft', 1]]),
      serviceName: fig.gag.serviceName, destination: fig.gag.destination, description: fig.gag.description,
    })
  }

  // 2) Ordinary requests, concentrated in big villages, to reach a healthy volume.
  for (const vid of Object.keys(byVillage).map(Number)) {
    const memberPersons = membership.member.filter(m => byVillage[vid].members.includes(m.person_id) && m.status === 'Active').map(m => m.person_id)
    const n = Math.max(2, Math.round(memberPersons.length * 0.8))
    for (let k = 0; k < n && memberPersons.length; k++) makeRequest(vid, rng.pick(memberPersons))
  }

  // 3) FCV submissions (Friendly Calls & Visits).
  const { contactTypes, activityTypes } = content.services.fcvActivities
  for (const vid of Object.keys(byVillage).map(Number)) {
    const village = content.__villageById[vid]
    const vols = byVillage[vid].volunteers; const mems = byVillage[vid].members
    const count = rng.int(2, 8)
    for (let k = 0; k < count && vols.length && mems.length; k++) {
      fcvId += 1
      const volP = personById[rng.pick(vols)]; const memP = personById[rng.pick(mems)]
      fcv_submission.push({
        id: fcvId, villageId: vid, villageName: village,
        volunteerPersonId: volP.id, rawVolunteerName: volP.full_name,
        memberPersonId: memP.id, rawMemberName: memP.full_name,
        visitDate: addDays(BASE_DATE, -rng.int(1, 200)).toISOString().slice(0, 10),
        timeSpentMinutes: rng.int(15, 120), contactType: rng.pick(contactTypes),
        activityTypes: JSON.stringify(rng.shuffle(activityTypes).slice(0, rng.int(1, 3))),
        activityOther: null, notes: rng.pick(content.services.fcvActivities.sampleNotes || [null]),
        submittedAt: dt(addDays(BASE_DATE, -rng.int(1, 200))),
      })
    }
  }

  return { service_request, notification_event, fcv_submission }
}
```

- [ ] **Step 4: Implement `data/generator/data.js`**

```js
import { makeRng } from './rng.js'
import { CAPABILITIES } from './constants.js'
import { buildVillagesAndUsers } from './builders/villages.js'
import { buildPersons } from './builders/persons.js'
import { buildMembership } from './builders/membership.js'
import { buildRequests } from './builders/requests.js'

export function buildDataset (content, seed) {
  const rng = makeRng(seed)
  const { village, user_data, village_grant, villageIdByName } = buildVillagesAndUsers(content, rng)
  // requests builder needs villageId -> name; pass via a private field
  content.__villageById = Object.fromEntries(village.map(v => [v.id, v.name]))

  const personsPlan = buildPersons(content, villageIdByName, rng)
  const membership = buildMembership(personsPlan, content, rng)
  const requests = buildRequests(personsPlan, membership, content, rng)

  return {
    village, user_data, village_grant,
    capability: CAPABILITIES.map(c => ({ id: c.id, name: c.name })),
    disability: membership.disability, vetting_type: membership.vetting_type,
    person: personsPlan.person,
    member: membership.member, volunteer: membership.volunteer,
    volunteer_capability: membership.volunteer_capability,
    volunteer_vetting: membership.volunteer_vetting,
    person_disability: membership.person_disability,
    service_request: requests.service_request,
    notification_event: requests.notification_event,
    fcv_submission: requests.fcv_submission,
  }
}

// Convenience loader of the committed content packs (used by cli.js).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
export function loadContent () {
  const read = (n) => JSON.parse(readFileSync(fileURLToPath(new URL(`../content/${n}`, import.meta.url)), 'utf8'))
  return { people: read('people.json'), services: read('services.json'), destinations: read('destinations.json') }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd data && node --test test/data.test.js`
Expected: PASS (all data.test.js cases).

- [ ] **Step 6: Commit**

```bash
git add data/generator/builders/requests.js data/generator/data.js data/test/data.test.js
git commit -m "feat(data): service requests + notifications + FCV + dataset orchestrator"
```

---

### Task 7: SQL seeder (primary loader) + dev-DB verification

**Files:**
- Create: `data/generator/seed-sql.js`

**Interfaces:**
- Consumes: `buildDataset`, `loadContent`, `config`, `withDb`, `insertRows`, `TABLE_ORDER`.
- Produces: `seedSql(dataset) -> { inserted: {table: count} }` — truncates owned tables and bulk-inserts the dataset.

- [ ] **Step 1: Implement `data/generator/seed-sql.js`**

```js
import { withDb, insertRows } from './db.js'
import { TABLE_ORDER } from './constants.js'

// Child-before-parent truncation order (reverse of insert order).
const TRUNCATE_ORDER = [...TABLE_ORDER].reverse()

export async function seedSql (dataset) {
  return withDb(async (conn) => {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const t of TRUNCATE_ORDER) {
      try { await conn.query('TRUNCATE TABLE `' + t + '`') } catch (e) {
        if (e.code !== 'ER_NO_SUCH_TABLE') throw e
      }
    }
    const inserted = {}
    for (const t of TABLE_ORDER) {
      const rows = dataset[t] || []
      await insertRows(conn, t, rows)
      inserted[t] = rows.length
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1')
    return { inserted }
  })
}
```

- [ ] **Step 2: Bring up the dev DB and run a real seed (manual verification)**

```bash
# from repo root
docker compose -f docker-compose.dev.yml up -d
# wait for healthy, then ensure schema exists by starting the API once (it runs migrations),
# OR if the dev DB already has the schema, skip. Then:
cd data && node -e "import('./generator/data.js').then(async m => { const ds = m.buildDataset(m.loadContent(), 20260630); const { seedSql } = await import('./generator/seed-sql.js'); console.log(await seedSql(ds)) })"
```

Expected: prints `{ inserted: { village: 10, user_data: ~18, person: ~300, member: ~180, volunteer: ~130, service_request: ~250+, notification_event: ~400+, fcv_submission: ~40+, ... } }` with no SQL errors. If you see `ER_NO_SUCH_TABLE` for `active_member`/views, that's fine (views aren't in TABLE_ORDER). If `person.address` errors, a builder is wrongly setting `address` — fix the builder.

- [ ] **Step 3: Sanity-query the seeded DB**

```bash
docker compose -f docker-compose.dev.yml exec -T db mysql -uvg -pvg vg -e "
  SELECT (SELECT COUNT(*) FROM village) v, (SELECT COUNT(*) FROM person) p,
         (SELECT COUNT(*) FROM member) m, (SELECT COUNT(*) FROM active_member) am,
         (SELECT COUNT(*) FROM volunteer) vol, (SELECT COUNT(*) FROM active_volunteer) avol,
         (SELECT COUNT(*) FROM service_request) sr,
         (SELECT COUNT(*) FROM service_request WHERE status IN ('Confirmed','Completed') AND volunteer_person_id IS NULL) bad_sr;"
```

Expected: `v=10`, `am < m`, `avol < vol`, `bad_sr = 0` (no Confirmed/Completed without a volunteer).

- [ ] **Step 4: Commit**

```bash
git add data/generator/seed-sql.js
git commit -m "feat(data): direct-SQL seeder (primary loader) into the dev DB"
```

---

### Task 8: App-data JSONL emitter + format tests

**Files:**
- Create: `data/generator/emit-appdata.js`
- Test: `data/test/emit-appdata.test.js`

**Interfaces:**
- Consumes: a `columnMap` (`{table: [colName,...]}`) and the dataset.
- Produces: `rowToArray(columns, obj) -> array`; `buildJsonl(dataset, columnMap, meta) -> string` (the full JSONL); `columnMapFromDb(conn, tables) -> {table: [cols]}` (introspects, excluding generated columns).

- [ ] **Step 1: Write the failing format test**

`data/test/emit-appdata.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowToArray, buildJsonl } from '../generator/emit-appdata.js'

test('rowToArray maps named fields to column order, missing -> null', () => {
  assert.deepEqual(rowToArray(['id', 'name', 'note'], { id: 1, name: 'x' }), [1, 'x', null])
})

test('buildJsonl emits version, summary, per-table header + row arrays', () => {
  const dataset = { village: [{ id: 1, name: 'Arkham' }, { id: 2, name: 'Quahog' }] }
  const columnMap = { village: ['id', 'name'] }
  const meta = { version: '1.0.0', commit: { sha: 'na' }, date: '2026-06-30T12:00:00.000Z', lastMigration: 6 }
  const lines = buildJsonl(dataset, columnMap, meta).trim().split('\n').map(JSON.parse)
  assert.equal(lines[0].lastMigration, 6)
  assert.deepEqual(lines[1], { tables: [{ table: 'village', rowCount: 2 }], totalRows: 2 })
  assert.deepEqual(lines[2], { table: 'village', columns: '`id`,`name`', rowCount: 2 })
  assert.deepEqual(lines[3], [1, 'Arkham'])
  assert.deepEqual(lines[4], [2, 'Quahog'])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd data && node --test test/emit-appdata.test.js`
Expected: FAIL — `Cannot find module '../generator/emit-appdata.js'`.

- [ ] **Step 3: Implement `data/generator/emit-appdata.js`**

```js
// Serialize the canonical dataset into the app-data JSONL format that
// GET /op/appdata produces and POST /op/appdata consumes:
//   line 1: {version, commit, date, lastMigration}
//   line 2: {tables:[{table,rowCount}], totalRows}
//   per table: {table, columns:"`a`,`b`", rowCount}  then one JSON array per row.

export function rowToArray (columns, obj) {
  return columns.map(c => (obj[c] === undefined ? null : obj[c]))
}

export function buildJsonl (dataset, columnMap, meta) {
  const tables = Object.keys(dataset).filter(t => (dataset[t] || []).length && columnMap[t])
  const lines = []
  lines.push(JSON.stringify({ version: meta.version, commit: meta.commit, date: meta.date, lastMigration: meta.lastMigration }))
  lines.push(JSON.stringify({
    tables: tables.map(t => ({ table: t, rowCount: dataset[t].length })),
    totalRows: tables.reduce((s, t) => s + dataset[t].length, 0),
  }))
  for (const t of tables) {
    const cols = columnMap[t]
    lines.push(JSON.stringify({ table: t, columns: cols.map(c => '`' + c + '`').join(','), rowCount: dataset[t].length }))
    for (const row of dataset[t]) lines.push(JSON.stringify(rowToArray(cols, row)))
  }
  return lines.join('\n') + '\n'
}

// Live-schema column order per table, excluding generated columns (e.g. person.address).
export async function columnMapFromDb (conn, tables) {
  const map = {}
  for (const t of tables) {
    const [rows] = await conn.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND EXTRA NOT LIKE '% GENERATED' " +
      'ORDER BY ORDINAL_POSITION',
      [conn.config.database, t])
    map[t] = rows.map(r => r.COLUMN_NAME)
  }
  return map
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd data && node --test test/emit-appdata.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add data/generator/emit-appdata.js data/test/emit-appdata.test.js
git commit -m "feat(data): app-data JSONL emitter + format tests"
```

---

### Task 9: Loader (`load-appdata.js`) + CLI (`cli.js`) + post-load sanity

**Files:**
- Create: `data/generator/load-appdata.js`
- Create: `data/generator/cli.js`

**Interfaces:**
- Consumes: `config`, `buildDataset`, `loadContent`, `seedSql`, `buildJsonl`, `columnMapFromDb`, `withDb`, `TABLE_ORDER`.
- Produces: `mintToken(oidcBase) -> string`; `importAppData(apiBase, token, jsonl) -> string`. `cli.js` is the executable entry (`node generator/cli.js [--sql] [--emit[=path]] [--import[=path]] [--roundtrip]`).

- [ ] **Step 1: Implement `data/generator/load-appdata.js`**

```js
import { config } from './env.js'

// Mint an admin token from the mock OIDC's get-token endpoint (RS256, JWKS-verifiable).
export async function mintToken (oidcBase = config.oidc.base) {
  if (config.token) return config.token // allow a pre-supplied bearer token
  const url = new URL('/api/get-token', oidcBase)
  url.searchParams.set('privileges', 'admin')
  url.searchParams.set('scope', 'vg:op')
  url.searchParams.set('username', 'demo-loader@villagegreen.test')
  url.searchParams.set('audience', 'village-green')
  url.searchParams.set('expiresIn', '300s')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`mock OIDC token mint failed: ${res.status} ${await res.text()}`)
  return (await res.json()).token
}

// POST the JSONL to /op/appdata. Returns the progress/result body (JSONL lines).
export async function importAppData (apiBase, token, jsonl) {
  const url = new URL('/op/appdata', apiBase)
  url.searchParams.set('elevate', 'true')
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/jsonl' },
    body: jsonl,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`/op/appdata import failed: ${res.status}\n${text}`)
  return text
}
```

- [ ] **Step 2: Implement `data/generator/cli.js`**

```js
import { config } from './env.js'
import { withDb } from './db.js'
import { TABLE_ORDER } from './constants.js'
import { buildDataset, loadContent } from './data.js'
import { seedSql } from './seed-sql.js'
import { buildJsonl, columnMapFromDb } from './emit-appdata.js'
import { mintToken, importAppData } from './load-appdata.js'
import { writeFileSync, readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const has = (f) => args.some(a => a === f || a.startsWith(f + '='))
const val = (f, d) => { const a = args.find(x => x.startsWith(f + '=')); return a ? a.split('=')[1] : d }

async function emitJsonl (dataset) {
  // need live column order (excludes generated cols) -> requires the dev DB schema present
  const columnMap = await withDb((conn) => columnMapFromDb(conn, TABLE_ORDER))
  const meta = { version: '1.0.0-demo', commit: { branch: 'na', sha: 'na', tag: 'na', describe: 'na' },
    date: '2026-06-30T12:00:00.000Z', lastMigration: 6 }
  return buildJsonl(dataset, columnMap, meta)
}

async function sanity () {
  const r = await withDb(async (conn) => {
    const [[c]] = await conn.query(`SELECT
      (SELECT COUNT(*) FROM village) v,
      (SELECT COUNT(*) FROM member) m, (SELECT COUNT(*) FROM active_member) am,
      (SELECT COUNT(*) FROM volunteer) vol, (SELECT COUNT(*) FROM active_volunteer) avol,
      (SELECT COUNT(*) FROM service_request) sr,
      (SELECT COUNT(*) FROM service_request WHERE status IN ('Confirmed','Completed') AND volunteer_person_id IS NULL) bad`)
    return c
  })
  if (r.v !== 10) throw new Error(`expected 10 villages, got ${r.v}`)
  if (r.bad !== 0) throw new Error(`${r.bad} Confirmed/Completed requests have no volunteer`)
  if (!(r.am < r.m) || !(r.avol < r.vol)) throw new Error('active views should filter some rows')
  console.log('sanity OK:', r)
}

const dataset = buildDataset(loadContent(), config.seed)

if (has('--sql') || args.length === 0) {
  console.log('SQL seed:', await seedSql(dataset))
  await sanity()
}
if (has('--emit')) {
  const out = val('--emit', 'demo-appdata.jsonl')
  writeFileSync(out, await emitJsonl(dataset))
  console.log('wrote', out)
}
if (has('--import')) {
  const path = val('--import', 'demo-appdata.jsonl')
  const jsonl = (has('--import') && val('--import', null)) ? readFileSync(path, 'utf8') : await emitJsonl(dataset)
  const token = await mintToken()
  console.log(await importAppData(config.api.base, token, jsonl))
}
if (has('--roundtrip')) {
  console.log('SQL seed:', await seedSql(dataset))
  const jsonl = await emitJsonl(dataset)
  const token = await mintToken()
  console.log('import result:', await importAppData(config.api.base, token, jsonl))
  await sanity()
}
```

- [ ] **Step 3: Verify `--sql` end to end**

Run: `cd data && node generator/cli.js --sql`
Expected: prints `SQL seed: { inserted: {...} }` then `sanity OK: { v: 10, ... bad: 0 }`.

- [ ] **Step 4: Verify the app-data round-trip (needs the API up with the flag)**

```bash
# Start mock OIDC (:18080) and the API with the experimental flag, e.g. via VS Code,
# or: from api/source, with VG_EXPERIMENTAL_APPDATA=true VG_OIDC_PROVIDER=http://localhost:18080 ... node index.js
cd data && node generator/cli.js --roundtrip
```

Expected: `import result:` shows a stream ending in `{"status":"success"}` (or similar) and a second `sanity OK`. If the endpoint errors (it's never been exercised), capture the message — that's a real finding; the `--sql` path still works as the fallback. Record any endpoint bug in `data/README.md` under "Known issues".

- [ ] **Step 5: Commit**

```bash
git add data/generator/load-appdata.js data/generator/cli.js
git commit -m "feat(data): app-data loader + CLI (--sql/--emit/--import/--roundtrip) + sanity"
```

---

### Task 10: README + final pass

**Files:**
- Create: `data/README.md`
- Modify: `data/.gitignore` (Create) — ignore the generated artifact

**Interfaces:** none (docs).

- [ ] **Step 1: Create `data/.gitignore`**

```
node_modules/
demo-appdata.jsonl
content/_pack-*.json
content/_merge.mjs
```

- [ ] **Step 2: Write `data/README.md`**

Include: what this is; prerequisites (`docker compose -f ../docker-compose.dev.yml up -d`, schema present via running the API once); `npm install`; the commands (`npm run seed`, `npm run emit`, `npm run import`, `npm run roundtrip`) with the env knobs (`VG_DB_PORT`, `VG_DEMO_API_BASE`, `VG_DEMO_OIDC_BASE`, `VG_DEMO_SEED`, `VG_DEMO_TOKEN`); the note that the app-data path needs the API started with `VG_EXPERIMENTAL_APPDATA=true`; and the **demo personas/login table** (username → village/role → privilege) so a user knows what to type into the mock OIDC form. Pull the persona list from `content/people.json`'s `loginPersonas` and the usernames coded in `builders/villages.js` (admin = `samuel.slater@millworks.test`; 3-village coordinator = `john.brown@brownbros.test`; zero-grants = `mr.calimari@quahog.test`). State the mock-OIDC scope string to use: `vg:op vg:village vg:person vg:service-request vg:member vg:volunteer vg:user vg:friends:read`.

- [ ] **Step 3: Full test sweep**

Run: `cd data && node --test`
Expected: PASS across `rng.test.js`, `content.test.js`, `emit-appdata.test.js`, `data.test.js`.

- [ ] **Step 4: Commit**

```bash
git add data/README.md data/.gitignore
git commit -m "docs(data): README with run instructions + demo personas/logins"
```

---

## Self-Review

**Spec coverage:**
- SQL seeder (primary) → Task 7. App-data emitter + round-trip → Tasks 8–9. ✓
- Self-contained `data/` (own mysql2 + token mint) → Tasks 1, 9; no `test/` imports. ✓
- Deterministic, fixed seed, no `Date.now`/`Math.random` → Task 1 (rng), `BASE_DATE`; `data.test.js` determinism test. ✓
- Generated `address` never inserted → builder omits it; `data.test.js` asserts no `address` key; emitter excludes generated via `EXTRA NOT LIKE '% GENERATED'`. ✓
- `deriveStatus` invariants → `requests.js` + `data.test.js` + SQL `bad_sr=0` check. ✓
- Lookups (capability static ids; disability/vetting_type seeded) → `constants.js`, `membership.js`. ✓
- ~10 villages, two big (50+/50+), ~300 people, ~100% real cameos w/ gags, households, inactive slice, vetting, notifications, FCV → Tasks 4–6 + tests. ✓
- Personas/auth anchors (admin/no-grants, multi-village coordinator, each role, zero-grants) → `villages.js` + `data.test.js`. ✓
- Roster expansion to ~300 via subagent fan-out → Task 3. ✓
- App-data preconditions (flag, scope, elevate, content-type) + mock-OIDC mint → Task 9. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Every code step shows real code; every run step shows the command + expected output. Task 10 step 2 describes README prose content (acceptable — docs, not code). ✓

**Type consistency:** `buildVillagesAndUsers` returns `{village,user_data,village_grant,villageIdByName}` (used in Tasks 4–6). `buildPersons` returns `{person,byVillage}` (used in `membership.js`/`requests.js`). `buildMembership` returns the membership object (used in `requests.js`/`data.js`). `buildDataset(content, seed)` and `loadContent()` signatures match `cli.js` usage. `rowToArray(columns,obj)`/`buildJsonl(dataset,columnMap,meta)`/`columnMapFromDb(conn,tables)` consistent across Task 8 and `cli.js`. Canonical row keys match the verified DDL column names (camelCase for `village_grant`/`user_data`/`fcv_submission`; snake_case elsewhere). ✓

> One known soft spot to watch during execution: `requests.js` uses `content.__villageById` set in `data.js` before `buildRequests` runs — keep that assignment ahead of the call (it is). If a reviewer prefers, pass `villageById` explicitly as a parameter.
