# Privacy Acknowledgement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a blocking privacy rules acknowledgement system that records legally auditable acks per user with JWT evidence, re-prompts based on a configurable interval or new rule version, and gives admins UI to publish/correct rules.

**Architecture:** Two new DB tables (`privacy_rules`, `privacy_acknowledgement`) are append-only. The API exposes four endpoints under `/privacy` plus a new `privacyStatus` projection on `GET /user`. The Vue client shows a blocking modal on login when `needsAck` is true and adds an admin panel for publishing rules.

**Tech Stack:** Node.js/Express (API), MySQL/MariaDB (DB), Vue 3 + PrimeVue (client), express-openapi-validator (OAS routing), umzug (migrations).

## Global Constraints

- Migration numbering: next is `0007-privacy-acknowledgement.js`
- Controller convention: `module.exports.operationId = async function operationId(req, res, next)` — HTTP only, no DB logic
- Service convention: exported async functions, DB via `dbUtils.pool.query()` or transactions
- OAS operationId must exactly match controller export name — this is how express-openapi-validator routes requests
- Elevate check pattern: `if (!req.userObject.privileges?.admin) throw new SmError.PrivilegeError()`
- Token payload is available as `req.access_token` (decoded JWT, set by auth middleware)
- Config env var prefix: `VG_` for API vars
- `additionalProperties: false` on all OAS request/response schemas
- No markdown renderer in client dependencies — must install one (use `marked`, widely used, ESM-compatible)
- `apiCall(operationId, params, body)` on the client maps operationId directly to OAS spec

---

### Task 1: Database Migration

**Files:**
- Create: `api/source/service/migrations/0007-privacy-acknowledgement.js`

**Interfaces:**
- Produces: `privacy_rules` table and `privacy_acknowledgement` table in the database

- [ ] **Step 1: Write the migration file**

```js
const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  `CREATE TABLE privacy_rules (
    id INT NOT NULL AUTO_INCREMENT,
    content MEDIUMTEXT NOT NULL,
    publishedAt DATETIME NOT NULL,
    publishedByUserId INT NOT NULL,
    modifiedAt DATETIME NULL,
    modifiedByUserId INT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_privacy_rules_publisher FOREIGN KEY (publishedByUserId) REFERENCES user_data (userId),
    CONSTRAINT fk_privacy_rules_modifier FOREIGN KEY (modifiedByUserId) REFERENCES user_data (userId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE privacy_acknowledgement (
    id INT NOT NULL AUTO_INCREMENT,
    userId INT NOT NULL,
    rulesId INT NOT NULL,
    acknowledgedAt DATETIME NOT NULL,
    tokenClaims JSON NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_privacy_ack_user FOREIGN KEY (userId) REFERENCES user_data (userId),
    CONSTRAINT fk_privacy_ack_rules FOREIGN KEY (rulesId) REFERENCES privacy_rules (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
]

const downMigration = [
  `DROP TABLE IF EXISTS privacy_acknowledgement`,
  `DROP TABLE IF EXISTS privacy_rules`,
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => { await migrationHandler.up(pool, __filename) },
  down: async (pool) => { await migrationHandler.down(pool, __filename) },
}
```

- [ ] **Step 2: Run the migration**

```bash
cd api/source && node -e "
const { pool } = require('./service/utils')
const m = require('./service/migrations/0007-privacy-acknowledgement')
m.up(pool).then(() => { console.log('Migration up OK'); process.exit(0) }).catch(e => { console.error(e); process.exit(1) })
"
```

Expected: `Migration up OK`

- [ ] **Step 3: Verify tables exist**

```bash
mysql -u vg -p vg -e "SHOW TABLES LIKE 'privacy%';"
```

Expected: `privacy_acknowledgement` and `privacy_rules` listed.

- [ ] **Step 4: Commit**

```bash
git add api/source/service/migrations/0007-privacy-acknowledgement.js
git commit -m "feat: add privacy_rules and privacy_acknowledgement tables"
```

---

### Task 2: Config — Add `PRIVACY_ACK_INTERVAL_DAYS`

**Files:**
- Modify: `api/source/utils/config.js`

**Interfaces:**
- Produces: `config.privacy.ackIntervalDays` (integer, default 365)

- [ ] **Step 1: Add the privacy block to config.js**

In `api/source/utils/config.js`, after the `google` block (line ~126) and before the closing `}` of the config object, add:

```js
    privacy: {
        ackIntervalDays: (() => {
            const val = parseInt(process.env.VG_PRIVACY_ACK_INTERVAL_DAYS)
            if (isNaN(val) || val < 1) return 365
            return val
        })(),
    },
```

- [ ] **Step 2: Verify config loads**

```bash
cd api/source && node -e "const c = require('./utils/config'); console.log(c.privacy)"
```

Expected: `{ ackIntervalDays: 365 }`

- [ ] **Step 3: Commit**

```bash
git add api/source/utils/config.js
git commit -m "feat: add VG_PRIVACY_ACK_INTERVAL_DAYS config"
```

---

### Task 3: OAS Spec — Privacy Schemas and Endpoints

**Files:**
- Modify: `api/source/specification/village-green.yaml`

**Interfaces:**
- Produces: operationIds `getPrivacyRules`, `publishPrivacyRules`, `patchPrivacyRulesCurrent`, `createPrivacyAcknowledgement`
- Produces: `privacyStatus` added to `UserPreferenceQuery` enum and `UserProjected` schema

- [ ] **Step 1: Add privacy schemas**

In `village-green.yaml`, find the `components: schemas:` section and add after the `WebPreferencesPatch` schema (around line 3897):

```yaml
    PrivacyRules:
      additionalProperties: false
      type: object
      properties:
        id:
          type: integer
        content:
          type: string
        publishedAt:
          type: string
          format: date-time
        publishedByUserId:
          type: integer
        modifiedAt:
          type: string
          format: date-time
          nullable: true
        modifiedByUserId:
          type: integer
          nullable: true
      required:
      - id
      - content
      - publishedAt
      - publishedByUserId
    PrivacyRulesPost:
      additionalProperties: false
      type: object
      properties:
        content:
          type: string
          minLength: 1
      required:
      - content
    PrivacyRulesPatch:
      additionalProperties: false
      type: object
      properties:
        content:
          type: string
          minLength: 1
      required:
      - content
    PrivacyAcknowledgementPost:
      additionalProperties: false
      type: object
      properties:
        rulesId:
          type: integer
      required:
      - rulesId
    PrivacyAcknowledgement:
      additionalProperties: false
      type: object
      properties:
        id:
          type: integer
        rulesId:
          type: integer
        acknowledgedAt:
          type: string
          format: date-time
      required:
      - id
      - rulesId
      - acknowledgedAt
    PrivacyStatus:
      additionalProperties: false
      type: object
      properties:
        needsAck:
          type: boolean
        pendingRulesId:
          type: integer
          nullable: true
        lastAckedRulesId:
          type: integer
          nullable: true
        lastAcknowledgedAt:
          type: string
          format: date-time
          nullable: true
      required:
      - needsAck
      - pendingRulesId
      - lastAckedRulesId
      - lastAcknowledgedAt
```

- [ ] **Step 2: Add `privacyStatus` to `UserProjected` schema**

Find the `UserProjected` schema (around line 3631) and add `privacyStatus` to its `properties`:

```yaml
        privacyStatus:
          $ref: '#/components/schemas/PrivacyStatus'
```

- [ ] **Step 3: Add `privacyStatus` to `UserPreferenceQuery` enum**

Find `UserPreferenceQuery` (around line 4089) and update the enum:

```yaml
        enum:
        - webPreferences
        - privacyStatus
```

- [ ] **Step 4: Add `/privacy/rules` and `/privacy/acknowledgements` paths**

Find the `paths:` section and add after `/user/web-preferences` (after line 657):

```yaml
  /privacy/rules:
    get:
      tags:
      - Privacy
      summary: Return the current published privacy rules
      operationId: getPrivacyRules
      responses:
        '200':
          description: Current privacy rules
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PrivacyRules'
        '404':
          description: No rules published yet
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        default:
          description: unexpected error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      security:
      - oauth:
        - vg:user:read
    post:
      tags:
      - Privacy
      summary: Publish a new version of privacy rules
      operationId: publishPrivacyRules
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PrivacyRulesPost'
      responses:
        '201':
          description: New privacy rules version published
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PrivacyRules'
        default:
          description: unexpected error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      security:
      - oauth:
        - vg:user:read
  /privacy/rules/current:
    patch:
      tags:
      - Privacy
      summary: Correct the current published privacy rules without creating a new version
      operationId: patchPrivacyRulesCurrent
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PrivacyRulesPatch'
      responses:
        '200':
          description: Privacy rules corrected
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PrivacyRules'
        '404':
          description: No rules published yet
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        default:
          description: unexpected error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      security:
      - oauth:
        - vg:user:read
  /privacy/acknowledgements:
    post:
      tags:
      - Privacy
      summary: Record the current user's acknowledgement of the privacy rules
      operationId: createPrivacyAcknowledgement
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PrivacyAcknowledgementPost'
      responses:
        '201':
          description: Acknowledgement recorded
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PrivacyAcknowledgement'
        default:
          description: unexpected error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      security:
      - oauth:
        - vg:user:read
```

- [ ] **Step 5: Validate the spec parses without error**

```bash
cd api/source && node -e "
const yaml = require('js-yaml')
const fs = require('fs')
const spec = yaml.load(fs.readFileSync('./specification/village-green.yaml', 'utf8'))
console.log('Paths with /privacy:', Object.keys(spec.paths).filter(p => p.includes('privacy')))
console.log('Schemas:', Object.keys(spec.components.schemas).filter(s => s.includes('Privacy')))
"
```

Expected output includes all four `/privacy` paths and all six `Privacy*` schemas.

- [ ] **Step 6: Commit**

```bash
git add api/source/specification/village-green.yaml
git commit -m "feat: add privacy rules and acknowledgement OAS spec"
```

---

### Task 4: API Service — `PrivacyService.js`

**Files:**
- Create: `api/source/service/PrivacyService.js`

**Interfaces:**
- Consumes: `config.privacy.ackIntervalDays`, `config.oauth.claims` (for token claim keys)
- Produces:
  - `getPrivacyRules()` → `{ id, content, publishedAt, publishedByUserId, modifiedAt, modifiedByUserId } | null`
  - `publishPrivacyRules(content, userId)` → `{ id, content, publishedAt, publishedByUserId, modifiedAt, modifiedByUserId }`
  - `patchPrivacyRulesCurrent(content, userId)` → `{ id, content, publishedAt, publishedByUserId, modifiedAt, modifiedByUserId } | null`
  - `createPrivacyAcknowledgement(userId, rulesId, tokenClaims)` → `{ id, rulesId, acknowledgedAt }`
  - `getPrivacyStatus(userId)` → `{ needsAck, pendingRulesId, lastAckedRulesId, lastAcknowledgedAt }`

- [ ] **Step 1: Create PrivacyService.js**

```js
'use strict'

const dbUtils = require('./utils')
const config = require('../utils/config')

exports.getPrivacyRules = async function () {
  const sql = `
    SELECT
      id,
      content,
      DATE_FORMAT(publishedAt, '%Y-%m-%dT%TZ') AS publishedAt,
      publishedByUserId,
      DATE_FORMAT(modifiedAt, '%Y-%m-%dT%TZ') AS modifiedAt,
      modifiedByUserId
    FROM privacy_rules
    ORDER BY id DESC
    LIMIT 1`
  const [rows] = await dbUtils.pool.query(sql)
  return rows[0] ?? null
}

exports.publishPrivacyRules = async function (content, userId) {
  const sql = `
    INSERT INTO privacy_rules (content, publishedAt, publishedByUserId)
    VALUES (?, UTC_TIMESTAMP(), ?)`
  const [result] = await dbUtils.pool.query(sql, [content, userId])
  return exports.getPrivacyRules()
}

exports.patchPrivacyRulesCurrent = async function (content, userId) {
  const current = await exports.getPrivacyRules()
  if (!current) return null
  const sql = `
    UPDATE privacy_rules
    SET content = ?, modifiedAt = UTC_TIMESTAMP(), modifiedByUserId = ?
    WHERE id = ?`
  await dbUtils.pool.query(sql, [content, userId, current.id])
  return exports.getPrivacyRules()
}

exports.createPrivacyAcknowledgement = async function (userId, rulesId, tokenClaims) {
  const sql = `
    INSERT INTO privacy_acknowledgement (userId, rulesId, acknowledgedAt, tokenClaims)
    VALUES (?, ?, UTC_TIMESTAMP(), ?)`
  const [result] = await dbUtils.pool.query(sql, [userId, rulesId, JSON.stringify(tokenClaims)])
  const [rows] = await dbUtils.pool.query(
    `SELECT id, rulesId, DATE_FORMAT(acknowledgedAt, '%Y-%m-%dT%TZ') AS acknowledgedAt
     FROM privacy_acknowledgement WHERE id = ?`,
    [result.insertId]
  )
  return rows[0]
}

exports.getPrivacyStatus = async function (userId) {
  const current = await exports.getPrivacyRules()
  if (!current) {
    return { needsAck: false, pendingRulesId: null, lastAckedRulesId: null, lastAcknowledgedAt: null }
  }

  const sql = `
    SELECT rulesId, DATE_FORMAT(acknowledgedAt, '%Y-%m-%dT%TZ') AS acknowledgedAt
    FROM privacy_acknowledgement
    WHERE userId = ?
    ORDER BY acknowledgedAt DESC
    LIMIT 1`
  const [rows] = await dbUtils.pool.query(sql, [userId])
  const lastAck = rows[0] ?? null

  let needsAck = true
  if (lastAck) {
    const ackedCurrentVersion = lastAck.rulesId === current.id
    const intervalMs = config.privacy.ackIntervalDays * 24 * 60 * 60 * 1000
    const ackAge = Date.now() - new Date(lastAck.acknowledgedAt).getTime()
    const withinInterval = ackAge < intervalMs
    needsAck = !(ackedCurrentVersion && withinInterval)
  }

  return {
    needsAck,
    pendingRulesId: current.id,
    lastAckedRulesId: lastAck?.rulesId ?? null,
    lastAcknowledgedAt: lastAck?.acknowledgedAt ?? null,
  }
}
```

- [ ] **Step 2: Smoke-test the service manually**

```bash
cd api/source && node -e "
const svc = require('./service/PrivacyService')
svc.getPrivacyRules().then(r => console.log('getPrivacyRules:', r)).catch(console.error)
"
```

Expected: `getPrivacyRules: null` (no rules yet).

- [ ] **Step 3: Commit**

```bash
git add api/source/service/PrivacyService.js
git commit -m "feat: add PrivacyService"
```

---

### Task 5: API Controller — `Privacy.js`

**Files:**
- Create: `api/source/controllers/Privacy.js`

**Interfaces:**
- Consumes: `PrivacyService.getPrivacyRules`, `publishPrivacyRules`, `patchPrivacyRulesCurrent`, `createPrivacyAcknowledgement`
- Consumes: `req.userObject.userId`, `req.userObject.privileges?.admin`, `req.access_token` (decoded JWT payload)
- Consumes: `config.oauth.claims` — claim keys: `sub`, `iss`, `iat`, `exp`, plus `config.oauth.claims.name` and `config.oauth.claims.email`
- Produces: HTTP handlers matching OAS operationIds: `getPrivacyRules`, `publishPrivacyRules`, `patchPrivacyRulesCurrent`, `createPrivacyAcknowledgement`

- [ ] **Step 1: Create Privacy.js**

```js
'use strict'

const SmError = require('../utils/error')
const PrivacyService = require('../service/PrivacyService')
const config = require('../utils/config')

function filterTokenClaims(tokenPayload) {
  const { sub, iss, iat, exp } = tokenPayload
  const nameClaim = config.oauth.claims.name
  const emailClaim = config.oauth.claims.email
  const claims = { sub, iss, iat, exp }
  if (nameClaim && tokenPayload[nameClaim] !== undefined) claims[nameClaim] = tokenPayload[nameClaim]
  if (emailClaim && tokenPayload[emailClaim] !== undefined) claims[emailClaim] = tokenPayload[emailClaim]
  return claims
}

module.exports.getPrivacyRules = async function getPrivacyRules(req, res, next) {
  try {
    const rules = await PrivacyService.getPrivacyRules()
    if (!rules) throw new SmError.NotFoundError()
    res.json(rules)
  }
  catch (err) {
    next(err)
  }
}

module.exports.publishPrivacyRules = async function publishPrivacyRules(req, res, next) {
  try {
    if (!req.userObject.privileges?.admin) throw new SmError.PrivilegeError()
    const rules = await PrivacyService.publishPrivacyRules(req.body.content, req.userObject.userId)
    res.status(201).json(rules)
  }
  catch (err) {
    next(err)
  }
}

module.exports.patchPrivacyRulesCurrent = async function patchPrivacyRulesCurrent(req, res, next) {
  try {
    if (!req.userObject.privileges?.admin) throw new SmError.PrivilegeError()
    const rules = await PrivacyService.patchPrivacyRulesCurrent(req.body.content, req.userObject.userId)
    if (!rules) throw new SmError.NotFoundError()
    res.json(rules)
  }
  catch (err) {
    next(err)
  }
}

module.exports.createPrivacyAcknowledgement = async function createPrivacyAcknowledgement(req, res, next) {
  try {
    const tokenClaims = filterTokenClaims(req.access_token)
    const ack = await PrivacyService.createPrivacyAcknowledgement(
      req.userObject.userId,
      req.body.rulesId,
      tokenClaims
    )
    res.status(201).json(ack)
  }
  catch (err) {
    next(err)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/source/controllers/Privacy.js
git commit -m "feat: add Privacy controller"
```

---

### Task 6: Wire `privacyStatus` into `GET /user`

**Files:**
- Modify: `api/source/controllers/User.js`
- Modify: `api/source/service/UserService.js`

**Interfaces:**
- Consumes: `PrivacyService.getPrivacyStatus(userId)` → `{ needsAck, pendingRulesId, lastAckedRulesId, lastAcknowledgedAt }`
- Produces: `GET /user?projection=privacyStatus` includes `privacyStatus` in response

- [ ] **Step 1: Add privacyStatus projection to UserService**

In `api/source/service/UserService.js`, find the block that handles `webPreferences` projection (around line 80):

```js
  if(inProjection?.includes('webPreferences')) {
    columns.push(`ud.webPreferences`)
  }
```

The `privacyStatus` projection is computed, not a column — handle it after the main query returns. Find the `getUserByUserId` function and locate where the result object is assembled. After assembling the base result, add:

```js
  if (inProjection?.includes('privacyStatus')) {
    const PrivacyService = require('./PrivacyService')
    result.privacyStatus = await PrivacyService.getPrivacyStatus(result.userId)
  }
```

Look for where `getUserByUserId` builds its return value. The exact location depends on how the function is structured — find the `return` statement after the DB query and inject before it.

- [ ] **Step 2: Update User controller to accept `privacyStatus` in projection**

In `api/source/controllers/User.js`, `getUser` function (around line 91), the projection is built as:

```js
    const projection = ['villageGrants', 'statistics']
    if (req.query.projection) {
      projection.push(req.query.projection)
    }
```

This already passes the query projection value through to the service, so no change needed in the controller — the OAS spec change in Task 3 already added `privacyStatus` to the `UserPreferenceQuery` enum, which means the validator will accept it, and `UserService.getUserByUserId` will receive it in `inProjection`.

- [ ] **Step 3: Start the API and test manually**

```bash
# In one terminal: start the API
cd api/source && node index.js

# In another terminal (with a valid token):
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:54000/api/user?projection=privacyStatus" | jq .privacyStatus
```

Expected:
```json
{
  "needsAck": false,
  "pendingRulesId": null,
  "lastAckedRulesId": null,
  "lastAcknowledgedAt": null
}
```

- [ ] **Step 4: Commit**

```bash
git add api/source/service/UserService.js api/source/controllers/User.js
git commit -m "feat: add privacyStatus projection to GET /user"
```

---

### Task 7: Client — Install `marked` and Add `privacyApi.js`

**Files:**
- Modify: `client/package.json` (via npm install)
- Create: `client/src/features/Admin/api/privacyApi.js`

**Interfaces:**
- Produces:
  - `getPrivacyRules()` → API response `PrivacyRules | 404`
  - `publishPrivacyRules(content)` → `PrivacyRules`
  - `patchPrivacyRulesCurrent(content)` → `PrivacyRules`
  - `createPrivacyAcknowledgement(rulesId)` → `PrivacyAcknowledgement`

- [ ] **Step 1: Install marked**

```bash
cd client && npm install marked
```

Expected: `marked` appears in `package.json` dependencies.

- [ ] **Step 2: Create privacyApi.js**

```js
import { apiCall } from '../../../shared/api/apiClient.js'

export const getPrivacyRules = () => apiCall('getPrivacyRules')

export const publishPrivacyRules = (content) =>
  apiCall('publishPrivacyRules', {}, { content })

export const patchPrivacyRulesCurrent = (content) =>
  apiCall('patchPrivacyRulesCurrent', {}, { content })

export const createPrivacyAcknowledgement = (rulesId) =>
  apiCall('createPrivacyAcknowledgement', {}, { rulesId })
```

- [ ] **Step 3: Commit**

```bash
git add client/package.json client/package-lock.json client/src/features/Admin/api/privacyApi.js
git commit -m "feat: add privacyApi client and install marked"
```

---

### Task 8: Client — `PrivacyAckModal.vue`

**Files:**
- Create: `client/src/components/PrivacyAckModal.vue`
- Modify: `client/src/App.vue`
- Modify: `client/src/init.js`

**Interfaces:**
- Consumes: `VG.curUser.privacyStatus.needsAck` (boolean)
- Consumes: `VG.curUser.privacyStatus.pendingRulesId` (integer)
- Consumes: `getPrivacyRules()`, `createPrivacyAcknowledgement(rulesId)` from `privacyApi.js`
- Produces: blocking modal that sets `VG.curUser.privacyStatus.needsAck = false` on successful ack

- [ ] **Step 1: Update init.js to fetch privacyStatus on startup**

In `client/src/init.js`, find line 411:

```js
  const response = await fetch(`${VG.Env.apiBase}/user?projection=webPreferences`, {
```

Change to:

```js
  const response = await fetch(`${VG.Env.apiBase}/user?projection=webPreferences&projection=privacyStatus`, {
```

- [ ] **Step 2: Create PrivacyAckModal.vue**

```vue
<script setup>
import { ref, onMounted } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { marked } from 'marked'
import { getPrivacyRules, createPrivacyAcknowledgement } from '../features/Admin/api/privacyApi.js'

const visible = ref(false)
const rulesHtml = ref('')
const pendingRulesId = ref(null)
const acknowledging = ref(false)
const error = ref(null)

onMounted(async () => {
  if (!VG.curUser?.privacyStatus?.needsAck) return
  pendingRulesId.value = VG.curUser.privacyStatus.pendingRulesId
  try {
    const rules = await getPrivacyRules()
    rulesHtml.value = marked.parse(rules.content)
    visible.value = true
  }
  catch (err) {
    console.error('[PrivacyAckModal] Failed to load rules:', err)
  }
})

async function acknowledge() {
  acknowledging.value = true
  error.value = null
  try {
    await createPrivacyAcknowledgement(pendingRulesId.value)
    VG.curUser.privacyStatus.needsAck = false
    visible.value = false
  }
  catch (err) {
    error.value = 'Failed to record acknowledgement. Please try again.'
    console.error('[PrivacyAckModal] Ack failed:', err)
  }
  finally {
    acknowledging.value = false
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :closable="false"
    :close-on-escape="false"
    header="Privacy Policy"
    style="width: 600px; max-width: 95vw"
  >
    <div class="privacy-content" v-html="rulesHtml" />
    <p v-if="error" class="privacy-error">{{ error }}</p>
    <template #footer>
      <Button
        label="I Acknowledge"
        :loading="acknowledging"
        :disabled="acknowledging"
        @click="acknowledge"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.privacy-content {
  max-height: 60vh;
  overflow-y: auto;
  line-height: 1.6;
}

.privacy-error {
  color: var(--p-red-500);
  margin-top: 0.75rem;
  font-size: 0.9rem;
}
</style>
```

- [ ] **Step 3: Mount PrivacyAckModal in App.vue**

In `client/src/App.vue`, add the import alongside other global component imports:

```js
import PrivacyAckModal from './components/PrivacyAckModal.vue'
```

Add the component in the template, inside `.app-container`, after `<GlobalErrorModal />`:

```html
<PrivacyAckModal />
```

- [ ] **Step 4: Build the client to verify no compile errors**

```bash
cd client && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/init.js client/src/components/PrivacyAckModal.vue client/src/App.vue
git commit -m "feat: add PrivacyAckModal blocking popup on login"
```

---

### Task 9: Admin UI — `PrivacyRulesAdmin.vue`

**Files:**
- Create: `client/src/features/Admin/components/PrivacyRulesAdmin.vue`
- Modify: `client/src/features/Admin/components/AdminHub.vue`
- Modify: `client/src/router/index.js`

**Interfaces:**
- Consumes: `getPrivacyRules()`, `publishPrivacyRules(content)`, `patchPrivacyRulesCurrent(content)` from `privacyApi.js`
- Consumes: `marked` for rendering current rules preview

- [ ] **Step 1: Create PrivacyRulesAdmin.vue**

```vue
<script setup>
import { ref, onMounted, computed } from 'vue'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { marked } from 'marked'
import { getPrivacyRules, publishPrivacyRules, patchPrivacyRulesCurrent } from '../api/privacyApi.js'

const toast = useToast()
const currentRules = ref(null)
const draftContent = ref('')
const loading = ref(false)
const publishing = ref(false)
const saving = ref(false)

const currentHtml = computed(() =>
  currentRules.value ? marked.parse(currentRules.value.content) : null
)

onMounted(async () => {
  await loadRules()
})

async function loadRules() {
  loading.value = true
  try {
    currentRules.value = await getPrivacyRules()
    draftContent.value = currentRules.value?.content ?? ''
  }
  catch (err) {
    if (err?.status !== 404) {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load privacy rules', life: 4000 })
    }
  }
  finally {
    loading.value = false
  }
}

async function publish() {
  if (!draftContent.value.trim()) return
  publishing.value = true
  try {
    currentRules.value = await publishPrivacyRules(draftContent.value)
    toast.add({ severity: 'success', summary: 'Published', detail: 'New privacy rules version published. All users will be re-prompted.', life: 5000 })
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to publish rules', life: 4000 })
  }
  finally {
    publishing.value = false
  }
}

async function saveCorrections() {
  if (!draftContent.value.trim()) return
  saving.value = true
  try {
    currentRules.value = await patchPrivacyRulesCurrent(draftContent.value)
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Rules corrected. Existing acknowledgements remain valid.', life: 5000 })
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save corrections', life: 4000 })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="privacy-admin">
    <h1>Privacy Rules</h1>

    <div v-if="loading">Loading…</div>

    <template v-else>
      <section v-if="currentRules" class="current-rules">
        <h2>Current Published Version</h2>
        <p class="meta">
          Published {{ currentRules.publishedAt }}
          <span v-if="currentRules.modifiedAt"> · Last corrected {{ currentRules.modifiedAt }}</span>
        </p>
        <div class="rules-preview" v-html="currentHtml" />
      </section>
      <p v-else class="no-rules">No privacy rules have been published yet.</p>

      <section class="draft-section">
        <h2>Draft</h2>
        <p class="draft-hint">Edit the content below. "Publish" creates a new version and re-prompts all users. "Save corrections" edits the current version in place — existing acknowledgements remain valid.</p>
        <Textarea
          v-model="draftContent"
          :auto-resize="false"
          rows="16"
          style="width: 100%; font-family: monospace; font-size: 0.875rem"
          placeholder="Enter privacy rules in Markdown format…"
        />
        <div class="draft-actions">
          <Button
            label="Save corrections"
            severity="secondary"
            :loading="saving"
            :disabled="publishing || saving || !draftContent.trim() || !currentRules"
            @click="saveCorrections"
          />
          <Button
            label="Publish"
            :loading="publishing"
            :disabled="publishing || saving || !draftContent.trim()"
            @click="publish"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.privacy-admin {
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
}

h1 {
  margin: 0 0 1.5rem 0;
  font-size: 2rem;
  color: var(--color-text-primary);
}

h2 {
  font-size: 1.1rem;
  margin: 0 0 0.5rem 0;
  color: var(--color-text-primary);
}

.meta {
  font-size: 0.85rem;
  color: var(--color-text-dim);
  margin: 0 0 1rem 0;
}

.current-rules {
  margin-bottom: 2rem;
  padding: 1rem;
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  background: var(--color-background-light);
}

.rules-preview {
  max-height: 300px;
  overflow-y: auto;
  line-height: 1.6;
}

.no-rules {
  color: var(--color-text-dim);
  margin-bottom: 2rem;
}

.draft-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.draft-hint {
  font-size: 0.875rem;
  color: var(--color-text-dim);
  margin: 0;
}

.draft-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}
</style>
```

- [ ] **Step 2: Add route to router/index.js**

In `client/src/router/index.js`, after the analytics route (around line 85), add:

```js
  {
    path: '/admin/privacy',
    name: 'admin-privacy',
    component: () => import('../features/Admin/components/PrivacyRulesAdmin.vue'),
    meta: { requiresAdmin: true },
  },
```

- [ ] **Step 3: Add button to AdminHub.vue**

In `client/src/features/Admin/components/AdminHub.vue`, add navigation function:

```js
const navigateToPrivacy = () => {
  router.push({ name: 'admin-privacy' })
}
```

Add button in template, inside `.button-group`:

```html
<Button label="Privacy Rules" @click="navigateToPrivacy" />
```

Update the grid to accommodate 4 buttons (change `grid-template-columns: 1fr 1fr 1fr` to `1fr 1fr`).

- [ ] **Step 4: Build and verify**

```bash
cd client && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/Admin/components/PrivacyRulesAdmin.vue \
        client/src/router/index.js \
        client/src/features/Admin/components/AdminHub.vue
git commit -m "feat: add admin UI for privacy rules management"
```

---

### Task 10: End-to-End Smoke Test

Manual verification that the full flow works.

- [ ] **Step 1: Start API and client dev server**

```bash
# Terminal 1
cd api/source && node index.js

# Terminal 2
cd client && npm run dev
```

- [ ] **Step 2: Test — no rules published (modal should NOT appear)**

Log in as any user. Verify no modal appears. Check `VG.curUser.privacyStatus.needsAck` is `false` in the browser console.

- [ ] **Step 3: Publish rules as admin**

Navigate to `/admin/privacy`. Enter markdown content. Click "Publish". Verify toast "New privacy rules version published."

- [ ] **Step 4: Test — rules published, user has not acked (modal SHOULD appear)**

Log out and log back in (or refresh). Verify the blocking modal appears with the rendered markdown. Verify the dialog cannot be closed without clicking "I Acknowledge". Click "I Acknowledge". Verify modal closes and the app is accessible.

- [ ] **Step 5: Test — re-login after ack (modal should NOT appear within interval)**

Refresh the page. Verify no modal appears (ack is within the interval and version hasn't changed).

- [ ] **Step 6: Test — admin publishes new version (modal SHOULD appear again)**

As admin, publish new content. Log out and back in. Verify modal appears again with new content.

- [ ] **Step 7: Test — Save corrections**

As admin, go to `/admin/privacy`. Edit text and click "Save corrections". Verify toast "Rules corrected." Log out and back in — verify modal does NOT appear (ack is still valid, rulesId unchanged).

- [ ] **Step 8: Verify audit row in DB**

```bash
mysql -u vg -p vg -e "SELECT id, userId, rulesId, acknowledgedAt, JSON_KEYS(tokenClaims) AS claimKeys FROM privacy_acknowledgement;"
```

Expected: row present with `sub`, `iss`, `iat`, `exp`, and name/email claim keys.

- [ ] **Step 9: Commit any fixes found during smoke test**

```bash
git add -p
git commit -m "fix: <description of any issues found>"
```

---

## Self-Review Notes

- Task 6 (Step 1) flags that the exact injection point in `getUserByUserId` depends on reading the current code — the implementer must locate the return assembly point and inject there. The instruction is clear about what to do.
- `marked` is installed as a client dependency (not devDependency) since it runs in the browser bundle.
- The `UserPreferenceQuery` param change in Task 3 makes `privacyStatus` a valid query value for `GET /user` — this is the same endpoint `init.js` uses, so no new endpoint is needed.
- `patchPrivacyRulesCurrent` returns 404 if no rules exist — consistent with `GET /privacy/rules` behavior.
- Admin UI "Save corrections" button is disabled when no current rules exist (nothing to correct).
