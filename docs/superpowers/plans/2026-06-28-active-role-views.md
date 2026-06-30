# Active Member/Volunteer Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `active_member` and `active_volunteer` MySQL views so that all read queries silently exclude inactive members (`status != 'Active'`) and inactive volunteers (`active != 1`), including NULL in both cases.

**Architecture:** Two views are created in a new migration (0007). SELECT-path JOIN and FROM references to `member` and `volunteer` in `PersonService.js` and `VillageService.js` are replaced with `active_member` and `active_volunteer`. `ServiceRequestService.js` is intentionally left on the base tables — SR records are historical and must report member/volunteer IDs regardless of current role status. Aliases (`m`, `vol`) are preserved. Write operations (INSERT, UPDATE, DELETE) and FK constraints continue to target the base tables.

**Tech Stack:** Node.js, MySQL 8, the project's existing migration framework (umzug-style JS migrations with `up`/`down` functions receiving a pool).

## Global Constraints

- Migration file name pattern: `NNNN-kebab-description.js` — next is `0007-active-role-views.js`
- Migration JS module must export `{ up, down }` functions each receiving `pool`, matching the pattern in `0006-ce-member-volunteer-fields.js`
- Views are `CREATE OR REPLACE VIEW` so the migration is idempotent on re-run
- `down` must `DROP VIEW IF EXISTS` both views
- Only SELECT-path references change — INSERTs, UPDATEs, DELETEs, and FK constraints stay on base tables
- **Exception:** `ServiceRequestService.js` JOINs stay on base `member`/`volunteer` tables — SR records are historical and must surface member/volunteer IDs even when the role is now inactive
- Table aliases `m` (member) and `vol` (volunteer) must be preserved exactly; no alias changes
- No changes to API response shapes — only which rows appear

---

### Task 1: Migration — create `active_member` and `active_volunteer` views

**Files:**
- Create: `api/source/service/migrations/0007-active-role-views.js`

**Interfaces:**
- Produces: MySQL views `active_member` (same columns as `member`, filtered to `status = 'Active'`) and `active_volunteer` (same columns as `volunteer`, filtered to `active = 1`)

- [ ] **Step 1: Create the migration file**

```js
// api/source/service/migrations/0007-active-role-views.js
const logger = require('../../utils/logger')
const path = require('node:path')

const migrationName = path.basename(__filename, '.js')

const upFn = async (pool) => {
  const connection = await pool.getConnection()
  try {
    await connection.query(
      `CREATE OR REPLACE VIEW active_member AS
         SELECT * FROM member WHERE status = 'Active'`
    )
    await connection.query(
      `CREATE OR REPLACE VIEW active_volunteer AS
         SELECT * FROM volunteer WHERE active = 1`
    )
  } finally {
    await connection.release()
  }
}

const downFn = async (pool) => {
  const connection = await pool.getConnection()
  try {
    await connection.query(`DROP VIEW IF EXISTS active_volunteer`)
    await connection.query(`DROP VIEW IF EXISTS active_member`)
  } finally {
    await connection.release()
  }
}

module.exports = {
  up: async (pool) => {
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', migrationName })
      await upFn(pool)
      logger.writeInfo('mysql', 'migration', { status: 'finish', migrationName })
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', migrationName, message: e.message })
      throw e
    }
  },
  down: async (pool) => {
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'down', migrationName })
      await downFn(pool)
      logger.writeInfo('mysql', 'migration', { status: 'finish', migrationName })
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', migrationName, message: e.message })
      throw e
    }
  }
}
```

- [ ] **Step 2: Run the migration and verify the views exist**

Start the API (which runs migrations on startup), then verify in MySQL:

```sql
SHOW FULL TABLES IN vg WHERE Table_type = 'VIEW';
-- Expected: active_member and active_volunteer listed as VIEW

SELECT COUNT(*) FROM active_member;
-- Should be fewer rows than: SELECT COUNT(*) FROM member;

SELECT COUNT(*) FROM active_volunteer;
-- Should be fewer rows than: SELECT COUNT(*) FROM volunteer;
```

- [ ] **Step 3: Verify MERGE algorithm (predicate pushdown)**

```sql
EXPLAIN SELECT * FROM active_member WHERE person_id = 1;
-- Expected: type=const or ref on person_id, NOT a full scan.
-- The word "DERIVED" in the Extra column would indicate TEMPTABLE (bad).
-- Absence of DERIVED confirms MERGE is in use.
```

- [ ] **Step 4: Commit**

```bash
git add api/source/service/migrations/0007-active-role-views.js
git commit -m "feat: add active_member and active_volunteer views"
```

---

### Task 2: Update `PersonService.js` — swap table references

**Files:**
- Modify: `api/source/service/PersonService.js`

The file has five occurrences to change across three functions (`queryPersons`, `getPerson`, `getPersons`). Apply each substitution exactly as shown.

**Interfaces:**
- Consumes: views `active_member`, `active_volunteer` created in Task 1
- Produces: `queryPersons`, `getPerson`, `getPersons` — unchanged signatures, filtered results

- [ ] **Step 1: Update `queryPersons` (lines 36–37)**

Change:
```js
    'LEFT JOIN member m ON m.person_id = p.id',
    'LEFT JOIN volunteer vol ON vol.person_id = p.id'
```
To:
```js
    'LEFT JOIN active_member m ON m.person_id = p.id',
    'LEFT JOIN active_volunteer vol ON vol.person_id = p.id'
```

- [ ] **Step 2: Update `getPerson` JOIN lines (lines 87–88)**

Change:
```js
    'LEFT JOIN member m ON m.person_id = p.id',
    'LEFT JOIN volunteer vol ON vol.person_id = p.id'
```
To:
```js
    'LEFT JOIN active_member m ON m.person_id = p.id',
    'LEFT JOIN active_volunteer vol ON vol.person_id = p.id'
```

- [ ] **Step 3: Update `getPerson` subquery references (lines 99 and 114)**

Change line 99:
```js
    ) FROM member WHERE person_id = p.id) AS memberInfo`)
```
To:
```js
    ) FROM active_member WHERE person_id = p.id) AS memberInfo`)
```

Change line 114:
```js
    ) FROM volunteer vol2 WHERE vol2.person_id = p.id) AS volunteerInfo`)
```
To:
```js
    ) FROM active_volunteer vol2 WHERE vol2.person_id = p.id) AS volunteerInfo`)
```

- [ ] **Step 4: Update `getPersons` JOIN lines (lines 207–208)**

Change:
```js
    'LEFT JOIN member m ON m.person_id = p.id',
    'LEFT JOIN volunteer vol ON vol.person_id = p.id'
```
To:
```js
    'LEFT JOIN active_member m ON m.person_id = p.id',
    'LEFT JOIN active_volunteer vol ON vol.person_id = p.id'
```

- [ ] **Step 5: Restart API and manually verify**

Restart the API. Fetch the persons list for a village that has inactive members/volunteers and confirm those persons now show `roles: []` (or the reduced role list) rather than `['member']` / `['volunteer']`.

- [ ] **Step 6: Commit**

```bash
git add api/source/service/PersonService.js
git commit -m "feat: route PersonService queries through active role views"
```

---

### Task 3: Update `VillageService.js` — swap table references

**Files:**
- Modify: `api/source/service/VillageService.js`

Five sites to change: the `personCounts` subquery (lines 126–127), the `capabilityCounts` subquery (line 143), `getVillageMembers` (line 238), `getVillageVolunteers` (lines 258–260), and `getVillageServiceRequests` (lines 312, 314).

**Interfaces:**
- Consumes: views `active_member`, `active_volunteer` created in Task 1
- Produces: `getVillageMembers`, `getVillageVolunteers`, `queryVillages` (personCounts/capabilityCounts projections), `getVillageServiceRequests` — unchanged signatures, filtered results

- [ ] **Step 1: Update `personCounts` subquery (lines 126–127)**

Change:
```js
        LEFT JOIN member m ON p.id = m.person_id
        LEFT JOIN volunteer vol ON p.id = vol.person_id
```
To:
```js
        LEFT JOIN active_member m ON p.id = m.person_id
        LEFT JOIN active_volunteer vol ON p.id = vol.person_id
```

- [ ] **Step 2: Update `capabilityCounts` subquery (line 143)**

Change:
```js
      JOIN volunteer vol ON p.id = vol.person_id
```
To:
```js
      JOIN active_volunteer vol ON p.id = vol.person_id
```

- [ ] **Step 3: Update `getVillageMembers` FROM clause (line 238)**

Change:
```js
    'member m',
```
To:
```js
    'active_member m',
```

- [ ] **Step 4: Update `getVillageVolunteers` FROM clause (line 258)**

Change:
```js
    'volunteer vol',
```
To:
```js
    'active_volunteer vol',
```

- [ ] **Step 5: `getVillageServiceRequests` — leave on base tables**

`getVillageServiceRequests` is called by `VillageServiceRequestList.vue` and must report `memberId`/`volunteerId` for historical SRs regardless of current role status. Do NOT change lines 312 or 314 — they stay as `member m` and `volunteer vol`.

- [ ] **Step 6: Restart API and manually verify**

Restart the API. Fetch `GET /villages/:villageId/members` and `GET /villages/:villageId/volunteers` for a village with inactive records and confirm inactive records are absent. Also confirm the `personCounts` projection on `GET /villages` excludes inactive roles from counts.

- [ ] **Step 7: Commit**

```bash
git add api/source/service/VillageService.js
git commit -m "feat: route VillageService queries through active role views"
```

---

### `ServiceRequestService.js` — intentionally unchanged

The SR query functions JOIN `member` and `volunteer` directly (not the views). Service requests are historical records; `memberId` and `volunteerId` must be reported even when the linked person is no longer an active member or volunteer. No changes needed here.
