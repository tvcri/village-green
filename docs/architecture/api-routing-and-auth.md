# API Architecture: Routing, Auth, and Conventions

Onboarding reference for working in `api/`. Companion to
`client-initialization-and-data-flow.md` (client side) and
`rbac-permission-matrix.md` (per-endpoint permissions). Written 2026-07-14;
describes patterns, not line numbers — verify specifics against the code.

## App layout

The Node app root is **`api/source/`**, not `api/` — `package.json`,
`node_modules/`, and `test/` all live there. Run everything from
`api/source/`:

```bash
cd api/source
npm test        # node --test 'test/*.test.js'
```

Key directories under `api/source/`:

| Path | Role |
|------|------|
| `specification/village-green.yaml` | The single OpenAPI spec (monolithic, ~5k lines) — routing source of truth |
| `controllers/` | One file per spec tag; thin req/res handlers |
| `service/` | Business logic + SQL; one service per domain |
| `service/migrations/` | Numbered umzug migrations (run at API startup) |
| `bootstrap/` | Express wiring: middlewares, OpenAPI validator, client static serving |
| `utils/` | `config.js` (all env-driven), `auth.js`, `accessGates.js`, `error.js` (SmError), `writer.js`, `logger.js` |

## How a request becomes a controller call

Routing is driven entirely by the OpenAPI spec via `express-openapi-validator`
(configured in `bootstrap/middlewares.js`, resolver in
`bootstrap/bootstrapUtils.js`):

1. The operation's **first `tags[]` entry names the controller file**:
   `tags: [Privacy]` → `controllers/Privacy.js`.
2. The **`operationId` names the exported handler**: `operationId:
   getPrivacyRules` → `module.exports.getPrivacyRules`.
3. There is no `x-swagger-router-controller` or route table anywhere else.

Adding an endpoint therefore means: add the path item to
`village-green.yaml`, create/extend the tag's controller, put logic in a
service. **`validateApiSpec: true` means a YAML mistake kills API startup** —
a failed boot after a spec edit is almost always a spec syntax/structure
error.

Validation gotchas (see also project memory):
- Request **bodies** are validated with `coerceTypes: false` — types must be
  exact.
- **Path/query params** are always delivered coerced to their spec types —
  never string-compare a param the spec types as integer.
- `additionalProperties: false` is the house style on request bodies.

## The auth model: two layers, and which one actually rejects

This is the part agents most often mis-model. There are two layers:

**Layer 1 — OAS `security` blocks (the real gate).** Each operation declares
`security: [{ oauth: [scopes...] }]`. The validator calls
`auth.validateOauthSecurity`, which throws if there is no verified token.
**An operation with `security: []` is public** — this is the only mechanism
for unauthenticated endpoints (`/op/definition`, `/op/configuration`,
`/enrollment/*`). There is no path allowlist in `auth.js`.

**Layer 2 — middleware chain on `/api` (fail-open for unauthenticated).**
Order matters (`bootstrap/middlewares.js`):

| Middleware | Behavior without a token |
|------------|--------------------------|
| `auth.validateToken` | Verifies a bearer token *if present*, sets `req.access_token`. No token → `next()` (no rejection) |
| `auth.setupUser` | Populates `req.userObject` only when `req.access_token` exists |
| `auth.requirePrivacyAck` | Fail-open when no `userObject`; for authenticated users, 403s unless the op is in its small allowlist (`/op/definition`, `/privacy/*`, `/user`) |
| `accessGates.requireVolunteerAccess` | Mounted only on `/api/volunteer-requests`; identity-derived (linked person with an active volunteer row) |
| `accessGates.requireStaffAccess` | Fail-open when no `userObject`; otherwise deny-by-default unless the user holds any grant or the path prefix is in `STAFF_GATE_EXEMPT_PREFIXES` (`/user`, `/op`, `/privacy`, `/oauth`, `/volunteer-requests`, `/enrollment`) |

Consequences:
- To make an endpoint public: `security: []` in the spec, **plus** add its
  prefix to `STAFF_GATE_EXEMPT_PREFIXES` so authenticated-but-grantless users
  aren't 403'd by the staff gate.
- All these gates match **`req.path` relative to the `/api` mount** —
  `/op/definition`, not `/api/op/definition`.
- A 401 comes from the OAS security handler; a 403 comes from a gate or a
  per-endpoint permission check.

## House conventions

| Concern | Convention |
|---------|-----------|
| Outbound HTTP | `undici` `fetch` (+ manual `res.ok` check and error-with-`.status` wrapping) — no axios/got |
| DB access | `dbUtils.pool.query(sql, [params])` (mysql2); services own all SQL |
| Transactions | The transaction fn returns only an id; the controller re-fetches **after commit** (never read back inside an open transaction) |
| Errors | Throw `SmError.*` from `utils/error.js`; controllers `try { … } catch (err) { next(err) }` |
| Logging | `logger.writeDebug/writeError(component, subcomponent, object)` |
| Config | Everything through `utils/config.js` from `VG_*` env vars. Server-only secrets are commented "Never expose via getClientEnv()" — respect that when touching `bootstrap/client.js` |
| Client env | `/Env.js` is generated at runtime by `getClientEnv()` in `bootstrap/client.js` and registered **before** the static catch-all. New client-visible env vars go through `config.js` + `getClientEnv()` |
| Tests | `node:test` + `node:assert/strict`, **pure exported functions only** — there is no DB/HTTP test harness. Design services so branching logic is testable as pure helpers |

## Migrations

- Umzug runs pending migrations **at API startup** — restarting the API is
  how a migration gets applied in dev.
- Two coexisting styles: array-of-SQL through
  `migrations/lib/MigrationHandler.js` (preferred, see recent files) and
  inline `pool.getConnection()` code. Raw SQL either way — no knex.
- `migrations/sql/current/10-vg-tables.sql` and `20-vg-static.sql` are
  **generated** by `generateSchema.sh` (mysqldump against a migrated DB) —
  never hand-edit; take `--ours` in merges.
- Any migration adding columns to `member` or `volunteer` must also
  `CREATE OR REPLACE VIEW active_member` / `active_volunteer`, or the new
  column is silently invisible (the views were created with an expanded
  `SELECT *`).
- MySQL traps: `JSON_ARRAYAGG(DISTINCT …)` is MariaDB-only (use
  `dbUtils.jsonArrayAggDistinct()`); bare `true`/`false` in `JSON_OBJECT`
  serialize as ints (use `CAST('true' AS JSON)`).

## Keycloak integration

`service/KeycloakService.js` holds all Keycloak admin-API access: a
client-credentials admin token (from `config.keycloak.adminClientId/Secret`)
with refresh-buffer + retry, and realm/base-URL derived by
`parseAuthority(config.oauth.authority)`. Methods: `createUser`,
`findUserByUsername`, `updateUsername`, `deleteUser`,
`setTemporaryPassword`. **Identity convention: Keycloak `username` = the
person's email** (migration 0016); the app resolves user→person at runtime
via `person.email = user_data.username` — nothing is persisted, and
`user_data` appears only after first login (it is not evidence of account
existence; Keycloak is the authority).

## Notification pipeline

The API never sends email. It inserts rows into **`notification_event`**
(camelCase columns: `id, eventType, serviceRequestId, createdAt, sentAt,
recipients, failedAt, payload`), typically inside the same transaction as the
domain write. A separate repo — **`~/dev/tvcri/vg-email-sidecar`** (GitHub:
`tvcri/vg-email-sidecar`) — polls that table and sends via the Gmail API. Two
channels:

- **Durable** (service-request lifecycle, informational emails): the polled
  queue above; `payload` (JSON) carries data for events with no
  `serviceRequestId`.
- **Fast/ephemeral** (enrollment PINs): the API POSTs to the sidecar's
  internal HTTP listener (`/internal/send-pin`) fire-and-forget; the secret
  is never persisted. (Added on the `volunteer-self-signup` branch — see
  `scratch/superpowers/specs/2026-07-14-volunteer-enrollment-design.md`.)
