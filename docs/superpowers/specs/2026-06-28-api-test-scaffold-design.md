# Village Green API Test Scaffold — Design

**Date:** 2026-06-28
**Status:** Approved (pending implementation plan)
**Author:** brainstormed with Claude Code

## Goal

Stand up a lightweight, black-box API integration test scaffold for the Village Green
backend, with the **primary purpose of verifying authorization correctness** — that only
the correct users can see appropriate information. The first suite targets the
**cross-village information-exposure** class of bug, including the **meta roll-up** guarantee
(that a multi-grant user's federation-wide view unions exactly their granted villages and
no others) for service requests.

Non-goals (for this pass): client/UI tests; exhaustive coverage of every endpoint; an
elaborate reference-data model. We deliberately avoid inheriting STIG Manager's heavy
test-harness baggage.

## Background / key findings

The repo was scaffolded from STIG Manager and stripped down. Relevant facts established
during exploration:

- **No test infrastructure exists** beyond `test/utils/mockOidc.js` (a full mock OIDC
  provider: mints RS256 JWTs, serves `.well-known` discovery + JWKS, has a standalone
  server mode) and a tiny `test/utils/package.json`. The API
  (`api/source/package.json`, named `stig-management-api`) has **no test script and no
  devDependencies** — a clean slate.
- **Auth model (the real, non-STIG parts):** `req.userObject.grants` is keyed by
  `villageId` → `{ villageId, name, roleId, grantIds }`. Roles: `1=restricted, 2=full,
  3=manage, 4=owner`. Privileges: `{ create_village, admin }`. The STIG ACL machinery
  (`sqlGrantees`, `cteAclEffective`, `collection_grant_acl`) is **dead code**.
- **List endpoints are grant-filtered** (`getServiceRequests`, `getPersons`,
  `getVillages`, `getFriends` filter by `Object.keys(grants)` unless `elevate=true`).
  `elevate` is **admin-only** — non-admins get `InvalidElevationError`.
- **By-ID endpoints are NOT grant-filtered.** `getServiceRequest(serviceRequestId)`
  (`controllers/ServiceRequest.js:41`) and `getPerson(personId)`
  (`controllers/Person.js:51`), plus their PATCH/DELETE, operate on a bare id with **no
  village-grant guard**. A user granted only on village A, holding
  `vg:service-request:read`, can `GET /service-requests/{id}` for a request in village B —
  and pull the member's/volunteer's home address, phone, and email via
  `?projection=memberAddress`. **This is a live cross-village information-exposure bug**
  and the central thing the first suite exists to catch.
- **Meta is client-only.** There is no `/meta` endpoint in the API; the client `/meta/*`
  routes reuse the ordinary list components in "meta mode" (`isMetaMode = !route.params.villageId`,
  `ServiceRequestList.vue`). The roll-up is therefore *entirely* a server-side property of
  the `getServiceRequests` list endpoint. In
  [ServiceRequestService.js:111-119](../../../api/source/service/ServiceRequestService.js#L111-L119)
  the grant filter (`sr.village_id IN (granted)`) is **always** applied for non-elevated
  requests, and a client-supplied `villageId` is **ANDed** on top — so a `villageId` can
  only ever *narrow within* a user's grants, never expand scope. This is a good (testable
  GREEN) property, and it is what makes the meta view safe.
- **Likely multi-value `villageId` bug.** Line 118 pushes `[villageId]` where `villageId`
  is already an array, double-wrapping it (`[['a','b']]`). For a single village it works by
  accident; for multiple selected villages the `IN (?)` bind renders a nested row
  constructor and the filter misbehaves. Not a security issue, but a correctness one the
  meta multiselect path hits — characterized by a (likely red) test.
- **Boot constraint:** the Express `app` is **not exportable** — `index.js` builds it,
  immediately `.listen()`s, and async-initializes DB + OIDC behind a state machine. This
  is why we run black-box against the spawned server rather than in-process.
- **Environment:** Node 24 (native `node:test`, global `fetch`, ESM), Docker Compose v2
  available. All backend config is `VG_*` env-driven, so the server can be pointed at a
  throwaway schema and the mock OIDC without code changes.

## Approach: black-box HTTP, orchestrated

We run the **real shipped server** as a child process against a disposable MySQL 8 and the
existing mock OIDC, and exercise it entirely over HTTP. This touches **zero production boot
code**, faithfully tests the full stack (OpenAPI validation → auth middleware → grant
SQL), and proves the artifact actually boots (the state machine reaching `available` is the
readiness gate). Because the authorization logic lives in SQL, tests run against a **real
MySQL** — mocking the DB would defeat the purpose.

Alternatives considered and rejected: **in-process supertest** (requires refactoring the
production boot path the user asked to leave alone, and our assertions are purely
HTTP-shaped so its internal-stubbing power buys nothing here); **testing against a
manually-run stack** (pushes startup/seeding orchestration onto the operator every run).

## Architecture: the orchestrator

A single orchestrator, `test/api/run.js` (invoked by `npm test`), owns the entire
lifecycle so a run is one self-contained command:

1. **MySQL 8** — `docker compose up -d` a disposable `mysql:8` on a non-default host port
   (default `3307`); wait for its healthcheck.
2. **mockOidc** — instantiate `test/utils/mockOidc.js` **in the orchestrator process** and
   start it listening (discovery + JWKS) on a dedicated port.
3. **API** — spawn `node index.js` as a child process from `api/source/` with test env:
   `VG_DB_*` → the container, `VG_DB_SCHEMA=vg_test`, `VG_OIDC_PROVIDER` → mockOidc,
   `VG_API_PORT` → dedicated port, `VG_DEV_RESPONSE_VALIDATION=logOnly`. On first boot the
   API scaffolds the schema (`setupSchema`) and runs migrations.
4. **Wait for ready** — poll `GET /api/op/state` until `available`.
5. **Seed fixtures** — connect with `mysql2` and insert the canonical dataset via
   parameterized SQL (after the schema exists).
6. **Mint tokens** — call `mockOidc.getToken(...)` for every canonical user (overriding
   the STIG-flavored defaults with VG values: `realm_access.roles` privileges + `vg:*`
   scopes) and write them to a gitignored `test/api/.tokens.json`.
7. **Run tests** — spawn `node --test` over `test/api/**/*.test.js` as a child. Test files
   read the base URL + tokens from env / `.tokens.json`. mockOidc stays alive in the parent
   so JWKS remains servable (and re-fetchable) during the run.
8. **Teardown** — stop the API child, stop mockOidc, `docker compose down -v`. A `--keep`
   flag leaves infra up for fast iterative re-runs.

**Why pre-mint tokens to a file:** the Node test runner isolates each test file in its own
process, so an in-memory mockOidc instance can't be shared across files. Minting where the
signing key lives (the orchestrator) and handing tests plain JWT strings keeps test files
trivial (`fetch` + assertions) and decoupled from the OIDC key.

**Token specifics:** mockOidc defaults are STIG-flavored
(`privileges: ['create_collection','admin']`, `scope: 'stig-manager'`) and MUST be
overridden. Its claim-path defaults (`realm_access.roles`, `preferred_username`) already
match VG config. Each canonical user is seeded as a real user row (in whichever table
backs `getUserObject` — `user`/`user_data`, to be confirmed at implementation) whose
username equals the token's `preferred_username`, so `getUserObject` resolves the intended
grants deterministically. Special tokens (expired, wrong/missing scope, insecure-kid) are minted
explicitly.

## Tooling & layout — zero new runtime deps

- **Runner:** built-in `node:test` + `node:assert/strict`. **HTTP:** global `fetch`. Both
  native in Node 24.
- **Only added dependency:** `mysql2` (seeding/teardown), in `test/api/package.json`
  (`"type": "module"` — black-box tests never import API code, so ESM is free). No
  mocha/chai/supertest.

```
test/
  utils/mockOidc.js            # existing — reused as-is
  api/
    package.json               # type:module, devDep mysql2, "test": "node run.js"
    docker-compose.yml         # mysql:8, throwaway, healthcheck
    run.js                     # orchestrator (steps 1-8)
    .gitignore                 # .tokens.json
    SECURITY-FINDINGS.md       # documents the cross-village leak the red tests assert against
    setup/
      env.js                   # ports, schema name, paths — single source of truth
      seed.js                  # fixture SQL inserts
      fixtures.js              # canonical users/villages/grants/data (exported, shared w/ tests)
      tokens.js                # getToken wrappers per canonical user + special tokens
    lib/
      client.js                # vgFetch(path,{user,query,body,elevate}) -> {status,json,res}
      tokens.js                # loads .tokens.json for test files
    auth/
      authentication.test.js   # no/expired/bad-sig/insecure-kid token; scope enforcement
      elevation.test.js        # elevate admin-only; admin+elevate sees all; admin w/o elevate sees granted-only
    service-request/
      meta-rollup.test.js      # HEADLINE: multi-grant union/exclusion (meta roll-up guarantee)
      authz.test.js            # by-ID + nested-route cross-village info-exposure (the core)
      lifecycle.test.js        # create/patch/status + read-after-write correctness
    persons/
      authz.test.js            # cross-village person/address exposure
    smoke/
      state-and-spec.test.js   # /op/state available; /op/definition serves the spec
```

## Canonical fixtures

**Three** villages, so a multi-grant user's roll-up has both an *included* set and an
*excluded* target (with only two villages, "union of my grants" is indistinguishable from
"everything"). The third village is owned by someone else and never granted to the
multi-user, which is what proves exclusion. Theme: Rhode Island, with a Lovecraftian/
fictional flavor — **all data is fake**.

**Villages:** `V1` = Quahog, `V2` = Innsmouth, `V3` = Miskatonic.

**Users.** In production the `username`/`preferred_username` claim is an **email address**
(social logins, or institutional emails) — so fixtures use email-shaped usernames (with
reserved-for-testing domains so they're obviously fake). Display names are famous RI
residents — historical, modern, or fictional. The `role` column is the stable key tests
reference, so test logic stays readable regardless of username format; all are seeded as
real user rows.

| role (test key) | persona (display) | username (email)              | grants                       | privileges |
|-----------------|-------------------|-------------------------------|------------------------------|------------|
| `owner_v1`      | Roger Williams    | `roger.williams@gmail.test`   | Quahog · roleId 4 (owner)    | —          |
| `full_v1`       | Anne Hutchinson   | `anne.hutchinson@quahog.test` | Quahog · roleId 2 (full)     | —          |
| `restricted_v1` | Gilbert Stuart    | `gilbert.stuart@gmail.test`   | Quahog · roleId 1 (restr.)   | —          |
| `full_v2`       | H.P. Lovecraft    | `hp.lovecraft@miskatonic.test`| Innsmouth · roleId 2         | —          |
| `full_v3`       | Nathanael Greene  | `n.greene@ri.test`            | Miskatonic · roleId 2        | —          |
| `multi`         | John Brown        | `john.brown@brownbros.test`   | **Quahog + Innsmouth** · roleId 2 | —     |
| `admin`         | Moses Brown       | `moses.brown@brownbros.test`  | none                         | `admin`    |
| `nogrants`      | Mr. Calimari      | `mr.calimari@quahog.test`     | none                         | —          |

(`john.brown`/`moses.brown` — the Brown brothers, shared domain — make a tidy multi-grant
vs. admin pair. `multi` deliberately lacks Miskatonic, the exclusion target. Reserved
`.test` TLD keeps every address unmistakably fake.)

**Domain data per village** (themed, fake; distinct from auth users to avoid confusion):
each village gets ≥1 person who is a member and ≥1 person who is a volunteer, with
`address`/`city`/`state`/`zip`/`phone`/`cell`/`email` populated so a projection-leak is
observable. Suggested domain personas — Quahog: Esek Hopkins (member), Stephen Hopkins
(volunteer); Innsmouth: Zadok Allen (member), Obed Marsh (volunteer); Miskatonic: Herbert
West (member), Henry Armitage (volunteer). Service requests carry themed destinations
(e.g. "Arkham Sanitarium", "Miskatonic University", "Federal Hill"). Service requests:
`srV1` (Quahog, member + volunteer assigned), `srV2` (Innsmouth), `srV3` (Miskatonic).
Fixed known IDs so tests assert against specific rows, not fragile counts. Mutation tests
create their own rows and never depend on global counts, keeping every test independent
against the shared seed.

## Initial test plan

### 1. Authentication & scope (`auth/authentication.test.js`)
- No `Authorization` header → 401; malformed / bad-signature token → 401; expired → 401;
  insecure-kid token rejected (unless `VG_DEV_ALLOW_INSECURE_TOKENS`).
- Token missing `vg:service-request:read` → 403 on `GET /service-requests`; read-only token
  → 403 on `POST`/`PATCH`.

### 2. Meta roll-up — service requests (HEADLINE) (`service-request/meta-rollup.test.js`)
Meta is client-only; the API guarantee that the meta view depends on is the
`getServiceRequests` list endpoint correctly unioning a multi-grant user's villages and
excluding the rest — *even when the client supplies a `villageId`*. These are mostly
**GREEN** positive-security assertions:
- `multi` `GET /service-requests` (no `villageId`) → union of Quahog ∪ Innsmouth rows;
  **Miskatonic (`srV3`) never present** (the "All villages" roll-up).
- `multi` `GET /service-requests?villageId=<Quahog>` → only Quahog (client narrows within
  grants).
- `multi` `GET /service-requests?villageId=<Miskatonic>` (ungranted) → `[]`, **no leak**
  (the grant filter is always ANDed, so a client `villageId` can only narrow, never expand).
- `full_v1` `GET /service-requests?villageId=<Innsmouth>` (ungranted) → `[]`, no leak.
- **Multi-value filter bug (likely RED):** `multi`
  `GET /service-requests?villageId=<Quahog>&villageId=<Innsmouth>` →
  characterizes the `[villageId]` double-wrap at
  [ServiceRequestService.js:118](../../../api/source/service/ServiceRequestService.js#L118)
  (a nested-array bind that misrenders the `IN` list for multiple villages).

### 3. Cross-village information-exposure — the core (`service-request/authz.test.js`, `persons/authz.test.js`)
- List baseline: `full_v1` `GET /service-requests` → only Quahog rows (`srV2`/`srV3` absent);
  `full_v2` only Innsmouth; `nogrants` → `[]`.
- **By-ID leak (expected RED until guard added):** `full_v1`
  `GET /service-requests/{srV2.id}` → asserts **404** (currently returns the row — the test
  fails until a village-grant guard is added).
- **Projection leak (expected RED):** `full_v1`
  `GET /service-requests/{srV2.id}?projection=memberAddress` → must not return Innsmouth
  member's address/phone/email.
- Same matrix for `GET /persons/{id}`, `GET /persons`, `GET /villages/{villageId}/persons`.
- Nested-route guard: `full_v1` `GET /villages/{Innsmouth}/service-requests` (and
  `/persons`) → 404.

### 4. Elevation (`auth/elevation.test.js`)
- `full_v1` with `?elevate=true` → 403 `InvalidElevationError` (non-admin can't elevate).
- `admin` `?elevate=true` → sees all three villages (Quahog + Innsmouth + Miskatonic);
  `admin` **without** elevate → sees only granted (none) → `[]`. Confirms admin is not
  implicitly omniscient.

### 5. Lifecycle / correctness (`service-request/lifecycle.test.js`)
- `POST` (member, no volunteer) → 201, `status: Open`, read-after-write body matches input.
- `PATCH` assign volunteer → `Confirmed`; re-patch same volunteer → no duplicate
  `email_event` (assert via DB).
- Status-filter mapping (`cancelled` → the three DB variants); datetimes round-trip as
  ISO-`Z`.

### 6. Smoke (`smoke/state-and-spec.test.js`)
- `/api/op/state` reports `available`; `/api/op/definition` serves the OpenAPI doc.
- The 503-before-ready gate is inherently exercised by the readiness poll (step 4); a
  dedicated deterministic black-box test for it would be flaky, so it is intentionally
  omitted.

## Handling of tests that expose current bugs (decision)

**Policy: assert the secure behavior, no `todo`/`skip` — let the failing tests go RED.**
The cross-village by-ID leak (test plan §3) is a real bug that needs fixing ASAP, so the
suite documents the *correct* behavior and stays red until the guard lands. When the fix is
added (possibly already in progress on another branch), these tests pass with no edit. A
short `test/api/SECURITY-FINDINGS.md` records the leak so a red run is self-explanatory.

Production domain code is **not** modified as part of this scaffolding work.

## Out of scope (documented next steps)

- **Meta roll-up for `persons` and `friends`** — this pass covers the meta union/exclusion
  guarantee for **service requests only**; persons/friends mirror the same list-endpoint
  pattern and are an easy follow-on.
- `friends` endpoints generally (FriendService already grant-filters) and `members`
  endpoints (MemberService is currently a stub with TODOs, deferred until implemented).
- Client-side meta *rendering* (the roll-up UI) — that is a client test, deferred.
- Code-coverage reporting across the child process.
- CI wiring (the orchestrator is CI-ready, but adding a workflow is a separate task).

## Risks / open questions

- **getUserObject auto-provisioning:** we seed all test users explicitly to avoid relying
  on any auto-create-on-first-token behavior; to be confirmed during implementation.
- **Scope claim format:** confirm the validator splits a space-delimited `scope` string vs.
  expecting an array; the token minting adapts accordingly.
- **Restricted role semantics:** whether `roleId 1` actually narrows visibility in the VG
  domain (vs. STIG) is unverified; the `restricted_v1` tests will characterize current
  behavior.
- **Docker required:** the suite assumes Docker is available locally/CI (chosen
  explicitly). A local-MySQL fallback via `VG_DB_*` is a possible later convenience.
