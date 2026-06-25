# Person Management — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Person a global identity with an optional home village, and implement member/volunteer/community role management as person sub-resources in the Village Green API.

**Architecture:** A `person` becomes globally identifiable (`village_id` nullable = optional home village). Member and volunteer are 1:1 role extensions managed at `/persons/{id}/member` and `/persons/{id}/volunteer`; a volunteer carries capabilities and associate villages (new `volunteer_village_associate` table). Community is an M:N tag stub (`community` + `person_community` tables) at `/persons/{id}/communities`. Thin controllers call services that own all SQL via `dbUtils` with transactions.

**Tech Stack:** Node.js, Express, MySQL (mysql2 pool), Umzug migrations, OpenAPI 3 (`openIdConnect` security), `SmError` error helpers.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-24-person-management-design.md` (local, gitignored).
- The API has **no automated test framework** (`todo.md:47`). Verification in this plan is **manual** via `curl`/REST against a running API. Do not introduce a test runner.
- **Restart the API** after editing any file under `api/source/` before verifying (project convention).
- All services own SQL; controllers stay thin (try/catch → `next(err)`), mirroring `api/source/controllers/Person.js`.
- Granting **member** or **volunteer** requires the person to have a home village → respond **422** (`SmError.UnprocessableError`). Community has **no** such requirement.
- All collection writes (capabilities, associate villages, communities) are **full-array replace** — delete-then-insert in a transaction. No individual add/remove.
- New write scope introduced: `vg:community`. Reads of person/role/community data use `vg:person:read`.
- Use `dbUtils.retryOnDeadlock2({ transactionFn, statusObj })` for multi-statement writes, matching `PersonService.createPerson`.

---

## File Structure

- **Modify** `api/source/service/migrations/sql/current/10-vg-tables.sql` — keep the canonical schema dump in sync (person nullable, drop unique, new tables). Reference only; the live change is the migration module.
- **Create** `api/source/service/migrations/0005-person-management.js` — the actual applied migration (Umzug auto-discovers it).
- **Modify** `api/source/service/PersonService.js` — optional home village, drop dup handling, `role` filter, `communities` projection, LEFT JOIN village.
- **Rewrite** `api/source/service/MemberService.js` — `putMember`/`patchMember`/`deleteMember`.
- **Create** `api/source/service/VolunteerService.js` — `putVolunteer`/`patchVolunteer`/`deleteVolunteer`.
- **Create** `api/source/service/CommunityService.js` — `getCommunities`/`putCommunities`.
- **Modify** `api/source/controllers/Person.js` — remove `ER_DUP_ENTRY` handling, pass `role`.
- **Rewrite** `api/source/controllers/Member.js` — person-sub-resource handlers.
- **Rewrite** `api/source/controllers/Volunteer.js` — person-sub-resource handlers.
- **Create** `api/source/controllers/Community.js` — community handlers.
- **Modify** `api/source/specification/village-green.yaml` — new paths/operations, schema changes, remove dead endpoints.

---

## Task 1: Database migration (global person, associate villages, community tables)

**Files:**
- Create: `api/source/service/migrations/0005-person-management.js`
- Modify: `api/source/service/migrations/sql/current/10-vg-tables.sql`

**Interfaces:**
- Produces: nullable `person.village_id`; dropped `person` unique key on `(village_id, full_name)`; tables `volunteer_village_associate`, `community`, `person_community`; seeded `community` rows `Pride`, `Veteran`.

- [ ] **Step 1: Create the migration module**

Create `api/source/service/migrations/0005-person-management.js`:

```javascript
const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  // Person becomes a global identity: home village is optional.
  `ALTER TABLE person MODIFY COLUMN village_id int DEFAULT NULL`,
  // Name collisions are natural; dedup moves to a soft UX concern.
  `ALTER TABLE person DROP INDEX village_id`,

  // A volunteer's zero-or-more associate villages beyond their home village.
  `CREATE TABLE volunteer_village_associate (
     id           int NOT NULL AUTO_INCREMENT,
     volunteer_id int NOT NULL,
     village_id   int NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY volunteer_village (volunteer_id, village_id),
     CONSTRAINT vva_volunteer_fk FOREIGN KEY (volunteer_id)
       REFERENCES volunteer (id) ON DELETE CASCADE,
     CONSTRAINT vva_village_fk FOREIGN KEY (village_id)
       REFERENCES village (id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  // Community membership (M:N tags). person_community is an association entity
  // (own id PK) so future per-membership property columns can be added.
  `CREATE TABLE community (
     id   int NOT NULL AUTO_INCREMENT,
     name varchar(100) NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY name (name)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `CREATE TABLE person_community (
     id           int NOT NULL AUTO_INCREMENT,
     person_id    int NOT NULL,
     community_id int NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY person_community (person_id, community_id),
     CONSTRAINT pc_person_fk FOREIGN KEY (person_id)
       REFERENCES person (id) ON DELETE CASCADE,
     CONSTRAINT pc_community_fk FOREIGN KEY (community_id)
       REFERENCES community (id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  `INSERT INTO community (name) VALUES ('Pride'), ('Veteran')`,
]

const downMigration = [
  `DROP TABLE IF EXISTS person_community`,
  `DROP TABLE IF EXISTS community`,
  `DROP TABLE IF EXISTS volunteer_village_associate`,
  `ALTER TABLE person ADD UNIQUE KEY village_id (village_id, full_name)`,
  `ALTER TABLE person MODIFY COLUMN village_id int NOT NULL`,
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => {
    await migrationHandler.up(pool, __filename)
  },
  down: async (pool) => {
    await migrationHandler.down(pool, __filename)
  }
}
```

- [ ] **Step 2: Update the canonical schema dump**

In `api/source/service/migrations/sql/current/10-vg-tables.sql`:

1. In the `person` table (around line 120-142), change `village_id` int NOT NULL → `int DEFAULT NULL`, and **remove** the line `UNIQUE KEY \`village_id\` (\`village_id\`,\`full_name\`),`.
2. After the `volunteer_capability` table block, append the three new `CREATE TABLE` statements (`volunteer_village_associate`, `community`, `person_community`) matching the migration, plus the `Pride`/`Veteran` seed insert.

This keeps the dump consistent with a freshly-migrated DB. (The dump is reference; the migration is authoritative.)

- [ ] **Step 3: Apply the migration by restarting the API**

The API runs pending migrations on boot via Umzug.

Run: restart the API process (`api/source/`).
Expected: startup logs show migration `0005-person-management` executed; no errors.

- [ ] **Step 4: Verify schema manually**

Run against the DB (mysql client or your tool of choice):
```sql
SHOW COLUMNS FROM person LIKE 'village_id';        -- Null = YES
SHOW INDEX FROM person WHERE Key_name = 'village_id';  -- empty (constraint dropped)
SELECT name FROM community ORDER BY name;          -- Pride, Veteran
SHOW TABLES LIKE 'volunteer_village_associate';    -- 1 row
SHOW TABLES LIKE 'person_community';               -- 1 row
```
Expected: `village_id` nullable, no `village_id` unique index, community seeded, both new tables present.

- [ ] **Step 5: Commit**

```bash
git add api/source/service/migrations/0005-person-management.js \
        api/source/service/migrations/sql/current/10-vg-tables.sql
git commit -m "feat(db): global person, associate villages, community tables

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: PersonService — optional home village, role filter, communities projection

**Files:**
- Modify: `api/source/service/PersonService.js`

**Interfaces:**
- Consumes: `dbUtils.pool`, `dbUtils.makeQueryString`, `dbUtils.retryOnDeadlock2`.
- Produces: `getPersons({ ..., role })` accepting `role` ∈ `member|volunteer|community`; `getPerson(personId, projections)` honoring a `communities` projection; create/patch accepting optional `villageId`.

- [ ] **Step 1: LEFT JOIN village in both query builders**

In `queryPersons` (top of file) and in `getPersons`, change:
```javascript
'JOIN village v ON v.id = p.village_id',
```
to:
```javascript
'LEFT JOIN village v ON v.id = p.village_id',
```
Rationale: global persons have NULL `village_id`; an inner join would silently drop them. The existing `JSON_OBJECT('villageId', CAST(v.id AS CHAR), 'name', v.name)` yields a JSON object of NULLs when unmatched — acceptable (client treats it as no home village).

- [ ] **Step 2: Add the `role` filter to `getPersons`**

In `module.exports.getPersons`, extend the destructured params and add predicates. Change the signature line:
```javascript
module.exports.getPersons = async function ({ villageIdsGranted, elevate, villageId, firstName, lastName, phone, email }) {
```
to include `role`:
```javascript
module.exports.getPersons = async function ({ villageIdsGranted, elevate, villageId, firstName, lastName, phone, email, role }) {
```
Then, after the `email` predicate block and before `const orderBy`, add:
```javascript
  if (role === 'member') {
    predicates.statements.push('m.id IS NOT NULL')
  }
  else if (role === 'volunteer') {
    predicates.statements.push('vol.id IS NOT NULL')
  }
  else if (role === 'community') {
    joins.add('JOIN person_community pc ON pc.person_id = p.id')
  }
```
(The `member`/`volunteer` LEFT JOINs already exist in `getPersons`. The `community` case uses an inner join so only persons with a community surface.)

- [ ] **Step 3: Add the `communities` projection to `getPerson`**

In `module.exports.getPerson`, after the existing `volunteerInfo` projection block (ends with the `}` closing that `if`), add:
```javascript
  if (projections.includes('communities')) {
    columns.push(`(
      SELECT COALESCE(
        CAST(CONCAT('[', GROUP_CONCAT(CONCAT('"', c.name, '"') ORDER BY c.name), ']') AS JSON),
        JSON_ARRAY()
      )
      FROM person_community pc
      JOIN community c ON c.id = pc.community_id
      WHERE pc.person_id = p.id
    ) AS communities`)
  }
```
Also change `getPerson`'s `JOIN village v` to `LEFT JOIN village v` (same NULL-home-village reason).

- [ ] **Step 4: Drop duplicate-name handling reliance (service side)**

No code change needed in PersonService for the dropped constraint (the `ER_DUP_ENTRY` catch lives in the controller, handled in Task 6). `createPerson`/`patchPerson` already map `villageId` only `if (villageId !== undefined)`, so optional home village already works. Confirm by reading `createPerson` (lines ~126-154) — no change required.

- [ ] **Step 5: Verify manually**

Restart the API. Then:
```bash
# Create a global person (no villageId) — should 201
curl -sX POST "$API/persons" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"fullName":"Global Tester"}' | jq

# List with role filter
curl -s "$API/persons?role=member" -H "Authorization: Bearer $TOKEN" | jq 'length'
curl -s "$API/persons?role=volunteer" -H "Authorization: Bearer $TOKEN" | jq 'length'

# Get one with communities projection (empty array for a fresh person)
curl -s "$API/persons/<id>?projection=memberInfo&projection=volunteerInfo&projection=communities" \
  -H "Authorization: Bearer $TOKEN" | jq '.communities'
```
Expected: global person creates (201, `village` object of nulls), role filters return arrays, `communities` is `[]`.

- [ ] **Step 6: Commit**

```bash
git add api/source/service/PersonService.js
git commit -m "feat(person): optional home village, role filter, communities projection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: MemberService — put/patch/delete

**Files:**
- Rewrite: `api/source/service/MemberService.js`

**Interfaces:**
- Consumes: `dbUtils.pool`, `dbUtils.retryOnDeadlock2`; `PersonService.getPerson`.
- Produces: `putMember(personId, body)`, `patchMember(personId, body)`, `deleteMember(personId)`; a `personHasHomeVillage(personId)` helper returning boolean. `putMember`/`patchMember` return the updated person (via `PersonService.getPerson` with member projection); `deleteMember` returns nothing.

- [ ] **Step 1: Replace the file contents**

Overwrite `api/source/service/MemberService.js`:

```javascript
'use strict';
const dbUtils = require('./utils')
const PersonService = require('./PersonService')

// Map camelCase member attributes to snake_case columns.
function mapMemberFields (body) {
  const fields = {}
  if (body.memberNumber !== undefined) fields.member_number = body.memberNumber
  if (body.memberLevel  !== undefined) fields.member_level  = body.memberLevel
  if (body.serviceNotes !== undefined) fields.service_notes = body.serviceNotes
  if (body.joinDate     !== undefined) fields.join_date     = body.joinDate
  return fields
}

module.exports.personHasHomeVillage = async function (personId) {
  const [rows] = await dbUtils.pool.query(
    'SELECT village_id FROM person WHERE id = ?', [personId]
  )
  return rows.length > 0 && rows[0].village_id !== null
}

module.exports.memberExists = async function (personId) {
  const [rows] = await dbUtils.pool.query(
    'SELECT id FROM member WHERE person_id = ?', [personId]
  )
  return rows.length > 0
}

// Grant or fully replace the member role.
module.exports.putMember = async function (personId, body) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const fields = mapMemberFields(body)
      const [existing] = await connection.query(
        'SELECT id FROM member WHERE person_id = ?', [personId]
      )
      if (existing.length) {
        if (Object.keys(fields).length) {
          await connection.query('UPDATE member SET ? WHERE person_id = ?', [fields, personId])
        }
      }
      else {
        await connection.query('INSERT INTO member SET ?', { person_id: personId, ...fields })
      }
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['memberInfo'])
}

// Partially update an existing member role.
module.exports.patchMember = async function (personId, body) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const fields = mapMemberFields(body)
      if (Object.keys(fields).length) {
        await connection.query('UPDATE member SET ? WHERE person_id = ?', [fields, personId])
      }
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['memberInfo'])
}

module.exports.deleteMember = async function (personId) {
  await dbUtils.pool.query('DELETE FROM member WHERE person_id = ?', [personId])
}
```

- [ ] **Step 2: Verify manually (after controllers exist in Task 7)**

This service is exercised through the controller. Defer runtime verification to Task 7, Step 4. For now, confirm the file `require`s resolve:

Run: restart the API.
Expected: no module-load errors in startup logs.

- [ ] **Step 3: Commit**

```bash
git add api/source/service/MemberService.js
git commit -m "feat(member): implement member role service (put/patch/delete)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: VolunteerService — put/patch/delete with capabilities and associate villages

**Files:**
- Create: `api/source/service/VolunteerService.js`

**Interfaces:**
- Consumes: `dbUtils.pool`, `dbUtils.retryOnDeadlock2`; `PersonService.getPerson`.
- Produces: `putVolunteer(personId, { capabilityIds, associateVillageIds })`, `patchVolunteer(personId, body)`, `deleteVolunteer(personId)`; returns the updated person (via `PersonService.getPerson(['volunteerInfo'])`) for put/patch.

- [ ] **Step 1: Create the file**

Create `api/source/service/VolunteerService.js`:

```javascript
'use strict';
const dbUtils = require('./utils')
const PersonService = require('./PersonService')

// Ensure a volunteer row exists for the person; return its id.
async function ensureVolunteer (connection, personId) {
  const [existing] = await connection.query(
    'SELECT id FROM volunteer WHERE person_id = ?', [personId]
  )
  if (existing.length) return existing[0].id
  const [res] = await connection.query(
    'INSERT INTO volunteer SET ?', { person_id: personId }
  )
  return res.insertId
}

// Full-array replace of capabilities for a volunteer.
async function replaceCapabilities (connection, volunteerId, capabilityIds) {
  await connection.query(
    'DELETE FROM volunteer_capability WHERE volunteer_id = ?', [volunteerId]
  )
  if (capabilityIds?.length) {
    const values = capabilityIds.map(id => [volunteerId, id])
    await connection.query(
      'INSERT INTO volunteer_capability (volunteer_id, capability_id) VALUES ?', [values]
    )
  }
}

// Full-array replace of associate villages for a volunteer.
async function replaceAssociateVillages (connection, volunteerId, villageIds) {
  await connection.query(
    'DELETE FROM volunteer_village_associate WHERE volunteer_id = ?', [volunteerId]
  )
  if (villageIds?.length) {
    const values = villageIds.map(id => [volunteerId, id])
    await connection.query(
      'INSERT INTO volunteer_village_associate (volunteer_id, village_id) VALUES ?', [values]
    )
  }
}

module.exports.volunteerExists = async function (personId) {
  const [rows] = await dbUtils.pool.query(
    'SELECT id FROM volunteer WHERE person_id = ?', [personId]
  )
  return rows.length > 0
}

// Grant or fully replace the volunteer role (capabilities + associates wholesale).
module.exports.putVolunteer = async function (personId, { capabilityIds = [], associateVillageIds = [] } = {}) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const volunteerId = await ensureVolunteer(connection, personId)
      await replaceCapabilities(connection, volunteerId, capabilityIds)
      await replaceAssociateVillages(connection, volunteerId, associateVillageIds)
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['volunteerInfo'])
}

// Partial update: replace only the arrays that are present.
module.exports.patchVolunteer = async function (personId, body = {}) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const volunteerId = await ensureVolunteer(connection, personId)
      if (body.capabilityIds !== undefined) {
        await replaceCapabilities(connection, volunteerId, body.capabilityIds)
      }
      if (body.associateVillageIds !== undefined) {
        await replaceAssociateVillages(connection, volunteerId, body.associateVillageIds)
      }
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['volunteerInfo'])
}

module.exports.deleteVolunteer = async function (personId) {
  // volunteer_capability and volunteer_village_associate cascade on volunteer delete
  // (associate has ON DELETE CASCADE; capability is cleared explicitly for safety).
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [rows] = await connection.query(
        'SELECT id FROM volunteer WHERE person_id = ?', [personId]
      )
      if (!rows.length) return
      const volunteerId = rows[0].id
      await connection.query('DELETE FROM volunteer_capability WHERE volunteer_id = ?', [volunteerId])
      await connection.query('DELETE FROM volunteer_village_associate WHERE volunteer_id = ?', [volunteerId])
      await connection.query('DELETE FROM volunteer WHERE id = ?', [volunteerId])
    },
    statusObj: undefined
  })
}
```

Note: `volunteer_capability` has no `ON DELETE CASCADE` in the existing schema, so it is cleared explicitly before deleting the volunteer to avoid an FK error.

- [ ] **Step 2: Verify the volunteerInfo projection includes associate villages**

The spec adds `associateVillages` to volunteer data, but `PersonService.getPerson`'s `volunteerInfo` projection currently returns only `volunteerId` + `capabilities`. Extend it: in `PersonService.getPerson`, within the `if (projections.includes('volunteerInfo'))` block, add an `associateVillages` sub-select to the `JSON_OBJECT`:

```javascript
      'associateVillages', (
        SELECT COALESCE(
          CAST(CONCAT('[', GROUP_CONCAT(
            JSON_OBJECT('villageId', CAST(vva.village_id AS CHAR), 'name', av.name)
          ), ']') AS JSON),
          JSON_ARRAY()
        )
        FROM volunteer_village_associate vva
        JOIN village av ON av.id = vva.village_id
        WHERE vva.volunteer_id = vol2.id
      )
```
Insert it as an additional key inside the existing `JSON_OBJECT('volunteerId', ..., 'capabilities', ...)` (add a comma after the `capabilities` sub-select).

- [ ] **Step 3: Verify manually (after controllers exist in Task 7)**

Defer runtime checks to Task 7, Step 4. For now:

Run: restart the API.
Expected: no module-load errors.

- [ ] **Step 4: Commit**

```bash
git add api/source/service/VolunteerService.js api/source/service/PersonService.js
git commit -m "feat(volunteer): implement volunteer role service with capabilities and associate villages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: CommunityService — get/put (full-array replace)

**Files:**
- Create: `api/source/service/CommunityService.js`

**Interfaces:**
- Consumes: `dbUtils.pool`, `dbUtils.retryOnDeadlock2`.
- Produces: `getCommunities(personId)` → array of `{ communityId, name }`; `putCommunities(personId, { communityIds })` → the updated array.

- [ ] **Step 1: Create the file**

Create `api/source/service/CommunityService.js`:

```javascript
'use strict';
const dbUtils = require('./utils')

module.exports.getCommunities = async function (personId) {
  const [rows] = await dbUtils.pool.query(
    `SELECT CAST(c.id AS CHAR) AS communityId, c.name
       FROM person_community pc
       JOIN community c ON c.id = pc.community_id
      WHERE pc.person_id = ?
      ORDER BY c.name`,
    [personId]
  )
  return rows
}

// Full-array replace of a person's community memberships.
module.exports.putCommunities = async function (personId, { communityIds = [] } = {}) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      await connection.query('DELETE FROM person_community WHERE person_id = ?', [personId])
      if (communityIds.length) {
        const values = communityIds.map(id => [personId, id])
        await connection.query(
          'INSERT INTO person_community (person_id, community_id) VALUES ?', [values]
        )
      }
    },
    statusObj: undefined
  })
  return await module.exports.getCommunities(personId)
}
```

- [ ] **Step 2: Verify**

Run: restart the API.
Expected: no module-load errors.

- [ ] **Step 3: Commit**

```bash
git add api/source/service/CommunityService.js
git commit -m "feat(community): implement community membership service (get/put)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Person controller — drop dup handling, pass role

**Files:**
- Modify: `api/source/controllers/Person.js`

**Interfaces:**
- Consumes: `PersonService.getPersons` (now accepts `role`), `PersonService.createPerson`.
- Produces: `getPersons` passes `role`; `createPerson` no longer special-cases `ER_DUP_ENTRY`.

- [ ] **Step 1: Pass `role` through `getPersons`**

In `module.exports.getPersons`, change the destructuring:
```javascript
    const { villageId, firstName, lastName, phone, email } = req.query
```
to:
```javascript
    const { villageId, firstName, lastName, phone, email, role } = req.query
```
and add `role` to the service call object:
```javascript
    const response = await PersonService.getPersons({
      villageIdsGranted,
      elevate,
      villageId,
      firstName,
      lastName,
      phone,
      email,
      role
    })
```

- [ ] **Step 2: Remove `ER_DUP_ENTRY` special-casing in `createPerson`**

Replace the nested try/catch in `module.exports.createPerson` with a direct call (the unique constraint is gone, so duplicate names are allowed):
```javascript
module.exports.createPerson = async function createPerson (req, res, next) {
  try {
    const body = req.body
    const response = await PersonService.createPerson(body)
    res.status(201).json(response[0])
  }
  catch (err) {
    next(err)
  }
}
```

- [ ] **Step 3: Verify manually**

Restart the API.
```bash
# Two persons with the same name now both succeed (no 422 dup error)
curl -sX POST "$API/persons" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"fullName":"John Smith","villageId":"<vid>"}' -o /dev/null -w "%{http_code}\n"
curl -sX POST "$API/persons" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"fullName":"John Smith","villageId":"<vid>"}' -o /dev/null -w "%{http_code}\n"
```
Expected: both return `201`.

- [ ] **Step 4: Commit**

```bash
git add api/source/controllers/Person.js
git commit -m "feat(person): pass role filter, drop duplicate-name handling

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Member & Volunteer controllers — person sub-resource handlers

**Files:**
- Rewrite: `api/source/controllers/Member.js`
- Rewrite: `api/source/controllers/Volunteer.js`

**Interfaces:**
- Consumes: `MemberService.{putMember,patchMember,deleteMember,personHasHomeVillage,memberExists}`, `VolunteerService.{putVolunteer,patchVolunteer,deleteVolunteer,volunteerExists}`, `MemberService.personHasHomeVillage` (reused by volunteer), `PersonService.getPerson`, `SmError`.
- Produces: controller exports keyed by the OAS operationIds defined in Task 9 — `putPersonMember`, `patchPersonMember`, `deletePersonMember`, `putPersonVolunteer`, `patchPersonVolunteer`, `deletePersonVolunteer`.

- [ ] **Step 1: Rewrite `Member.js`**

Overwrite `api/source/controllers/Member.js`:

```javascript
'use strict';
const MemberService = require('../service/MemberService')
const PersonService = require('../service/PersonService')
const SmError = require('../utils/error')

module.exports.putPersonMember = async function putPersonMember (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person) throw new SmError.NotFoundError()
    if (!(await MemberService.personHasHomeVillage(personId))) {
      throw new SmError.UnprocessableError('Person must have a home village to hold a member role.')
    }
    const response = await MemberService.putMember(personId, req.body)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.patchPersonMember = async function patchPersonMember (req, res, next) {
  try {
    const personId = req.params.personId
    if (!(await MemberService.memberExists(personId))) throw new SmError.NotFoundError()
    const response = await MemberService.patchMember(personId, req.body)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.deletePersonMember = async function deletePersonMember (req, res, next) {
  try {
    const personId = req.params.personId
    if (!(await MemberService.memberExists(personId))) throw new SmError.NotFoundError()
    await MemberService.deleteMember(personId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
```

- [ ] **Step 2: Rewrite `Volunteer.js`**

Overwrite `api/source/controllers/Volunteer.js`:

```javascript
'use strict';
const VolunteerService = require('../service/VolunteerService')
const MemberService = require('../service/MemberService')
const PersonService = require('../service/PersonService')
const SmError = require('../utils/error')

module.exports.putPersonVolunteer = async function putPersonVolunteer (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person) throw new SmError.NotFoundError()
    if (!(await MemberService.personHasHomeVillage(personId))) {
      throw new SmError.UnprocessableError('Person must have a home village to hold a volunteer role.')
    }
    const response = await VolunteerService.putVolunteer(personId, req.body)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.patchPersonVolunteer = async function patchPersonVolunteer (req, res, next) {
  try {
    const personId = req.params.personId
    if (!(await VolunteerService.volunteerExists(personId))) throw new SmError.NotFoundError()
    const response = await VolunteerService.patchVolunteer(personId, req.body)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.deletePersonVolunteer = async function deletePersonVolunteer (req, res, next) {
  try {
    const personId = req.params.personId
    if (!(await VolunteerService.volunteerExists(personId))) throw new SmError.NotFoundError()
    await VolunteerService.deleteVolunteer(personId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
```

- [ ] **Step 3: Confirm `SmError.UnprocessableError` exists**

Run: `grep -n "UnprocessableError" api/source/utils/error.js`
Expected: a class/export named `UnprocessableError` (it is already used in the current `Person.js`). If absent, stop and report — but it is referenced today, so it exists.

- [ ] **Step 4: Verify manually (full member + volunteer flow)**

Restart the API. Using a person WITH a home village (`$PID`) and one WITHOUT (`$GID`):
```bash
# 422 when granting member to a home-village-less person
curl -sX PUT "$API/persons/$GID/member" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{}' -o /dev/null -w "%{http_code}\n"   # 422

# grant member to a person with home village
curl -sX PUT "$API/persons/$PID/member" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"memberNumber":"M-100","joinDate":"2026-01-01"}' | jq '.memberInfo'

# patch member
curl -sX PATCH "$API/persons/$PID/member" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"memberLevel":"Gold"}' | jq '.memberInfo.memberLevel'  # "Gold"

# grant volunteer with capabilities + associate villages (use real ids)
curl -sX PUT "$API/persons/$PID/volunteer" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"capabilityIds":["1"],"associateVillageIds":["<vid2>"]}' | jq '.volunteerInfo'

# patch only capabilities — associates must remain
curl -sX PATCH "$API/persons/$PID/volunteer" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"capabilityIds":[]}' | jq '.volunteerInfo'

# revoke
curl -sX DELETE "$API/persons/$PID/volunteer" -H "Authorization: Bearer $TOKEN" -o /dev/null -w "%{http_code}\n"  # 204
curl -sX DELETE "$API/persons/$PID/member"    -H "Authorization: Bearer $TOKEN" -o /dev/null -w "%{http_code}\n"  # 204
```
Expected: 422 guard works; member grant/patch reflected; volunteer grant returns capabilities + associates; PATCH with `capabilityIds:[]` clears caps but **keeps** associates; deletes return 204.

- [ ] **Step 5: Commit**

```bash
git add api/source/controllers/Member.js api/source/controllers/Volunteer.js
git commit -m "feat(roles): person sub-resource controllers for member and volunteer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Community controller

**Files:**
- Create: `api/source/controllers/Community.js`

**Interfaces:**
- Consumes: `CommunityService.{getCommunities,putCommunities}`, `PersonService.getPerson`, `SmError`.
- Produces: `getPersonCommunities`, `putPersonCommunities`.

- [ ] **Step 1: Create the file**

Create `api/source/controllers/Community.js`:

```javascript
'use strict';
const CommunityService = require('../service/CommunityService')
const PersonService = require('../service/PersonService')
const SmError = require('../utils/error')

module.exports.getPersonCommunities = async function getPersonCommunities (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person) throw new SmError.NotFoundError()
    const response = await CommunityService.getCommunities(personId)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.putPersonCommunities = async function putPersonCommunities (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person) throw new SmError.NotFoundError()
    const response = await CommunityService.putCommunities(personId, req.body)
    res.json(response)
  }
  catch (err) { next(err) }
}
```

- [ ] **Step 2: Verify manually (after OAS wiring in Task 9)**

Defer to Task 9, Step 4.

Run: restart the API.
Expected: no module-load errors.

- [ ] **Step 3: Commit**

```bash
git add api/source/controllers/Community.js
git commit -m "feat(community): person communities controller (get/put)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: OpenAPI spec — new paths, schemas, removals

**Files:**
- Modify: `api/source/specification/village-green.yaml`

**Interfaces:**
- Consumes: existing parameter components `PersonIdPath`, `CapabilityId`, `VillageId`; controller operationIds from Tasks 6–8.
- Produces: operationIds `putPersonMember`, `patchPersonMember`, `deletePersonMember`, `putPersonVolunteer`, `patchPersonVolunteer`, `deletePersonVolunteer`, `getPersonCommunities`, `putPersonCommunities`; schemas `VolunteerPut`, `CommunityId`, `Community`; updated `Volunteer`, `PersonProjectionQuery`, `getPersons` `role` param.

> How operationId routes to a controller: this project's router maps `operationId` → `controllers/<Tag>.<operationId>`. Confirm by inspecting how `getPersons` is wired before adding paths:
> Run: `grep -rn "operationId\|x-router-controller\|controllers/Person" api/source/*.js api/source/utils/*.js | head`
> Use the SAME tag/controller convention the existing person paths use. Place member operations under tag `Member` (→ `controllers/Member.js`), volunteer under `Volunteer`, community under a new `Community` tag (→ `controllers/Community.js`). If the router resolves by `tags[0]` + `operationId`, the rewritten controller files already export these names.

- [ ] **Step 1: Add `role` query param to `GET /persons`**

In the `/persons` `get` `parameters` list (after the `email` param, around line 1077), add:
```yaml
        - name: role
          in: query
          description: Filter to persons holding a specific role
          schema:
            type: string
            enum:
            - member
            - volunteer
            - community
```

- [ ] **Step 2: Extend `PersonProjectionQuery` enum**

In `components/parameters/PersonProjectionQuery` (line ~3921), add `communities` to the enum:
```yaml
          enum:
          - memberInfo
          - volunteerInfo
          - communities
```

- [ ] **Step 3: Replace `/members` and `/volunteers` paths with person sub-resources**

Delete the entire `/members`, `/members/{memberId}`, `/volunteers`, `/volunteers/{volunteerId}`, and `/volunteers/{volunteerId}/capabilities` path blocks (lines ~1200-1485). In their place add:

```yaml
  /persons/{personId}/member:
    put:
      summary: Grant or replace the member role
      tags: [Member]
      operationId: putPersonMember
      parameters: [ { $ref: '#/components/parameters/PersonIdPath' } ]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/MemberPut' }
      responses:
        '200': { description: Person with member role, content: { application/json: { schema: { $ref: '#/components/schemas/Person' } } } }
        default: { description: error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
      security: [ { oauth: [ vg:member ] } ]
    patch:
      summary: Update member attributes
      tags: [Member]
      operationId: patchPersonMember
      parameters: [ { $ref: '#/components/parameters/PersonIdPath' } ]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/MemberPatch' }
      responses:
        '200': { description: Person with member role, content: { application/json: { schema: { $ref: '#/components/schemas/Person' } } } }
        default: { description: error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
      security: [ { oauth: [ vg:member ] } ]
    delete:
      summary: Revoke the member role
      tags: [Member]
      operationId: deletePersonMember
      parameters: [ { $ref: '#/components/parameters/PersonIdPath' } ]
      responses:
        '204': { description: Member role revoked }
        default: { description: error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
      security: [ { oauth: [ vg:member ] } ]

  /persons/{personId}/volunteer:
    put:
      summary: Grant or replace the volunteer role
      tags: [Volunteer]
      operationId: putPersonVolunteer
      parameters: [ { $ref: '#/components/parameters/PersonIdPath' } ]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/VolunteerPut' }
      responses:
        '200': { description: Person with volunteer role, content: { application/json: { schema: { $ref: '#/components/schemas/Person' } } } }
        default: { description: error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
      security: [ { oauth: [ vg:volunteer ] } ]
    patch:
      summary: Update volunteer capabilities and/or associate villages
      tags: [Volunteer]
      operationId: patchPersonVolunteer
      parameters: [ { $ref: '#/components/parameters/PersonIdPath' } ]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/VolunteerPatch' }
      responses:
        '200': { description: Person with volunteer role, content: { application/json: { schema: { $ref: '#/components/schemas/Person' } } } }
        default: { description: error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
      security: [ { oauth: [ vg:volunteer ] } ]
    delete:
      summary: Revoke the volunteer role
      tags: [Volunteer]
      operationId: deletePersonVolunteer
      parameters: [ { $ref: '#/components/parameters/PersonIdPath' } ]
      responses:
        '204': { description: Volunteer role revoked }
        default: { description: error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
      security: [ { oauth: [ vg:volunteer ] } ]

  /persons/{personId}/communities:
    get:
      summary: List a person's communities
      tags: [Community]
      operationId: getPersonCommunities
      parameters: [ { $ref: '#/components/parameters/PersonIdPath' } ]
      responses:
        '200':
          description: List of communities
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Community' }
        default: { description: error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
      security: [ { oauth: [ vg:person:read ] } ]
    put:
      summary: Replace a person's community memberships
      tags: [Community]
      operationId: putPersonCommunities
      parameters: [ { $ref: '#/components/parameters/PersonIdPath' } ]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              additionalProperties: false
              required: [ communityIds ]
              properties:
                communityIds:
                  type: array
                  items: { $ref: '#/components/schemas/CommunityId' }
      responses:
        '200':
          description: Updated communities
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Community' }
        default: { description: error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
      security: [ { oauth: [ vg:community ] } ]
```

- [ ] **Step 4: Update schemas**

In `components/schemas`:

1. **Rename** `MemberPost` → `MemberPut` (it is now the PUT body; keep the same properties, drop the `required: [personId]` since `personId` comes from the path). Final `MemberPut`:
```yaml
    MemberPut:
      additionalProperties: false
      type: object
      properties:
        memberNumber: { type: string, maxLength: 50 }
        memberLevel:  { type: string, maxLength: 100 }
        serviceNotes: { type: string }
        joinDate:     { type: string, format: date }
```
(`MemberPatch` already exists and is correct.)

2. **Replace** `VolunteerPost` with `VolunteerPut`, and update `VolunteerPatch` to include associate villages:
```yaml
    VolunteerPut:
      additionalProperties: false
      type: object
      properties:
        capabilityIds:
          type: array
          items: { $ref: '#/components/schemas/CapabilityId' }
        associateVillageIds:
          type: array
          items: { $ref: '#/components/schemas/VillageId' }
    VolunteerPatch:
      additionalProperties: false
      type: object
      minProperties: 1
      properties:
        capabilityIds:
          type: array
          items: { $ref: '#/components/schemas/CapabilityId' }
        associateVillageIds:
          type: array
          items: { $ref: '#/components/schemas/VillageId' }
```

3. **Extend** the `Volunteer` schema to include associate villages:
```yaml
        associateVillages:
          type: array
          items:
            type: object
            properties:
              villageId: { $ref: '#/components/schemas/VillageId' }
              name: { type: string }
```
(Add under the existing `capabilities` property.)

4. **Add** community schemas:
```yaml
    CommunityId:
      $ref: '#/components/schemas/StringIntId'
    Community:
      additionalProperties: false
      type: object
      required: [ communityId, name ]
      properties:
        communityId: { $ref: '#/components/schemas/CommunityId' }
        name: { type: string, maxLength: 100 }
```

5. **Extend** the `Person` schema to optionally carry `communities`:
```yaml
        communities:
          type: array
          items: { $ref: '#/components/schemas/Community' }
```
(Add under the existing `volunteerInfo` property.)

- [ ] **Step 5: Remove the village-scoped read endpoints**

Per `todo.md:230`, delete the `getVillageMembers` and `getVillageVolunteers` operations from the `/villages/{villageId}/members` and `/villages/{villageId}/volunteers` paths (search operationIds `getVillageMembers`, `getVillageVolunteers`, around lines 1839/1865), and remove their controller handlers in `api/source/controllers/Village.js` and service methods in `api/source/service/VillageService.js`. If `getVillagePersons`/`getVillagePerson` are also unused after the client migration (Plan B), leave them for Plan B to remove to avoid breaking the still-read-only client mid-flight.

> ⚠️ Coordination note: removing `getVillageMembers`/`getVillageVolunteers` will break the current client's MemberList/VolunteerList until Plan B repoints them. If you are executing Plan A alone and need the client to keep working, **defer Step 5** to the start of Plan B. Mark this step done only if Plan B follows immediately.

- [ ] **Step 6: Validate the spec parses**

Run: restart the API (it loads and validates the OAS at boot).
Expected: startup succeeds; no OpenAPI validation errors. If the project has a lint script, run it: `grep -n '"lint"\|swagger\|openapi' api/package.json` and run any spec-validation script found.

- [ ] **Step 7: Verify community endpoints manually**

```bash
# community ids
curl -s "$API/persons/$PID/communities" -H "Authorization: Bearer $TOKEN" | jq   # [] initially
# set Pride + Veteran (use ids from: SELECT id,name FROM community)
curl -sX PUT "$API/persons/$PID/communities" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"communityIds":["1","2"]}' | jq '.[].name'
# confirm projection on person
curl -s "$API/persons/$PID?projection=communities" -H "Authorization: Bearer $TOKEN" | jq '.communities'
```
Expected: PUT returns `["Pride","Veteran"]` (sorted), projection reflects them.

- [ ] **Step 8: Commit**

```bash
git add api/source/specification/village-green.yaml \
        api/source/controllers/Village.js api/source/service/VillageService.js
git commit -m "feat(api): person role sub-resources, community endpoints, remove dead endpoints

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Full manual verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the spec's manual verification checklist**

Restart the API, then execute each step from the spec's "Manual verification steps" (Section 5):
1. Create person with no home village → 201.
2. `PUT /persons/{id}/member` with no home village → 422.
3. Set home village (PATCH person), grant member → 200; PATCH attributes; DELETE → 204.
4. Grant volunteer with capabilities + associates; PATCH one array, confirm the other untouched; DELETE cascades.
5. `PUT /persons/{id}/communities` Pride/Veteran; GET reflects.
6. `GET /persons?role=member` / `?role=volunteer` correct; duplicate-name create allowed.
7. (Client steps are covered by Plan B.)

- [ ] **Step 2: Record results**

Note any deviations. All API steps must pass before starting Plan B. No commit (verification only).

---

## Self-Review (completed by plan author)

- **Spec coverage:** Section 1 (data model) → Task 1. Section 2 (API surface) → Tasks 6–9. Section 3 (backend services/controllers) → Tasks 2–8. Section 5 auth scopes → Task 9 security blocks; manual verification → Task 10. ✅
- **Removals:** dead `/members`,`/volunteers` CRUD, `/volunteers/{id}/capabilities`, village-scoped reads → Task 9 Steps 3 & 5. ✅
- **Type consistency:** controller exports (`putPersonMember`, etc.) match OAS operationIds (Task 9) and the Interfaces blocks. `VolunteerPut`/`MemberPut` schema names align between Task 9 Step 4 and the path bodies. `personHasHomeVillage` defined in MemberService (Task 3), reused by Volunteer controller (Task 7). ✅
- **Known risk flagged:** Task 9 Step 5 coordination note (client breakage if Plan A runs without Plan B). ✅
- **Placeholder scan:** no TBD/TODO/"handle edge cases"; all code blocks complete. ✅
