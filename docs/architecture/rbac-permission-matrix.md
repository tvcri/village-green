# RBAC Permission Matrix — role × route × endpoint

**Date:** 2026-07-11
**Purpose:** Review input for the rbac-access-ui branch review. Mechanical
cross-check of three sources that must agree: the seeded role→permission
matrix (migration 0013, post `village:read` fix), the client route meta
(`router/index.js`), and the API controller gates (`hasPermission` /
`hasElevatedPermission` calls). This is the systematic version of the spot
check that caught the missing `village:read`.

## 1. Seeded roles (migration 0013, as of commit a962138b)

| permission | LSC (v) | Steering Cmte (v) | Village Lead (v) | Admin (f) | Staff (f) | Board (f) | Svc Coord (f) |
|---|---|---|---|---|---|---|---|
| person:read | ✓ | ✓ | ✓ | * | ✓ | ✓ | ✓ |
| person:write | — | — | — | * | ✓ | — | — |
| person:read_confidential | — | — | — | * | ✓ | — | ✓ |
| member:read | ✓ | ✓ | ✓ | * | ✓ | ✓ | ✓ |
| member:write | — | — | — | * | ✓ | — | — |
| member:read_financial | — | — | — | * | ✓ | — | — |
| volunteer:read | ✓ | ✓ | ✓ | * | ✓ | ✓ | ✓ |
| volunteer:write | — | — | — | * | ✓ | — | — |
| sr:read | ✓ | ✓ | ✓ | * | ✓ | ✓ | ✓ |
| sr:write | — | — | — | * | ✓ | — | ✓ |
| friend:read | ✓ | ✓ | ✓ | * | ✓ | ✓ | ✓ |
| friend:write | — | — | — | * | ✓ | — | — |
| village:read | ✓ | ✓ | ✓ | * | ✓ | ✓ | ✓ |
| village:write | — | — | — | * | ✓ | — | — |

(v) = village-scoped grant, permission applies only to granted village(s).
(f) = federation-scoped, applies everywhere. Admin holds literal `*`.
Elevation-only keys (`user:admin`, `grant:admin`, `app:admin`,
`village:create`) are held via Admin `*` + elevation; not seeded per-role.

## 2. Route × page-fetch × API-gate table

"Page API calls" lists every operation the routed component (and its
always-mounted children) invokes, with the key the controller actually
gates on. **Agreement** = route meta key vs. the gate keys of the page's
fetches, evaluated against the seed matrix.

### Village-scoped routes (meta: villageScoped: true)

| route | meta key | page API calls → gate | agreement |
|---|---|---|---|
| `villages` | (none) | getVillages → ungated (scopes to grants) | OK — list self-scopes |
| `village-detail` | village:read | getVillage → village:read (scoped) | EXACT |
| `members` | member:read | getVillageMembers → member:read; getVillagePersons → **person:read** | cross-key (note N1) |
| `member-detail` | member:read | getPerson → **person:read** (vs person's home village) | cross-key (note N1) |
| `volunteers` | volunteer:read | getVillageVolunteers → volunteer:read; getVillagePersons → **person:read** | cross-key (note N1) |
| `volunteer-detail` | volunteer:read | getPerson → **person:read** | cross-key (note N1) |
| `service-requests` | sr:read | getVillageServiceRequests → sr:read; getVillage → **village:read** | cross-key (note N1) |
| `service-request-detail` | sr:read | getServiceRequest → sr:read (vs SR's village) | EXACT |
| `friends` | friend:read | getFriends → friend:read; getVillages → ungated | EXACT |

### Meta-section routes (federation check + meta where noted)

| route | meta key | page API calls → gate | agreement |
|---|---|---|---|
| `meta` | (fed check) | none | OK |
| `meta-persons` | (fed check) | getPersons → person:read; getVillages → ungated | OK — buttons gated person:write |
| `meta-person-detail` | (fed check) | getPerson → person:read; deletePerson → person:write | OK — Delete v-if person:write matches gate |
| `meta-person-create` | person:write | createPerson → person:write; getCommunities/getDisabilities/getVillages → ungated ref data | EXACT (+ self-guard) |
| `meta-person-edit` | person:write | getPerson → person:read; patchPerson → person:write | EXACT (+ self-guard) |
| `meta-person-import` | person:write | extractApplication → person:write (federation, fixed F2); createPerson → person:write; putPersonMember → member:write (fixed F1) | EXACT (+ self-guard) |
| `meta-person-member` | member:write | getPerson → person:read; put/patch/deletePersonMember → member:write (fixed F1) | EXACT (+ self-guard) |
| `meta-person-volunteer` | volunteer:write | getPerson → person:read; put/patch/deletePersonVolunteer → volunteer:write | EXACT (+ self-guard) |
| `meta-service-requests` | (fed check) | getServiceRequests → sr:read; patchServiceRequest (notify) → sr:write | OK — New/Edit/Send gated sr:write, matches |
| `meta-service-request-create` | sr:write | createServiceRequest → sr:write; getVillages ungated; getVillageMembers → member:read; getVillageVolunteers/getVolunteers → volunteer:read | EXACT + cross-key (note N1) (+ self-guard) |
| `meta-service-request-edit` | sr:write | getServiceRequest → sr:read; patchServiceRequest → sr:write; (same lookups as create) | EXACT + cross-key (+ self-guard) |
| `meta-friends` | (fed check) | getFriends → friend:read | OK — no write UI exists |

### Admin routes

All `/admin/*` routes: meta `user:admin` (or `app:admin` for privacy);
endpoints gate `user:admin` / `grant:admin` / `app:admin` via
`hasElevatedPermission`. Client and API agree; elevation is additionally
required API-side. No findings.

## 3. Findings

**F1 — FIXED 2026-07-11. Member write endpoints had NO API permission
gates.** `Member.js` (`putPersonMember`, `patchPersonMember`,
`deletePersonMember`) performed existence/home-village checks only — no
`hasPermission` call at all; enforcement was client-only, so any
authenticated user could write/delete member roles by calling the API
directly. Fixed by adding `member:write` gates scoped to the person's
home village, mirroring the `volunteer:write` gates in `Volunteer.js`.

**F2 — FIXED 2026-07-11. `extractApplication` was ungated.**
`Application.js` checked only file presence/type/size, so any
authenticated user could invoke the Anthropic-billed PDF extraction
(cost exposure, not just data exposure). Fixed with a federation-scoped
`person:write` gate before any file handling — matching the wizard's
client-side key; federation-scoped because import has no village context
until the operator resolves one from the PDF.

**N1 — Cross-key page fetches (latent, benign today).** Several pages
fetch under more keys than their route meta names: members/volunteers
pages also need `person:read`; the village SR list also calls `getVillage`
(`village:read`); SR create/edit lookups need `member:read`/
`volunteer:read`. Today every seeded role that holds any read key holds
all of them, so nothing breaks. But this is the same coincidence-of-seeds
pattern that produced the VillageDetail 403: a future narrow role (e.g.
`sr:read` only) passes route meta yet 403s mid-page. Options for the
review to weigh: (a) document that read keys travel as a set, (b) route
meta becomes an array of every key the page fetches under, or (c) pages
degrade gracefully on partial 403s. No action required for current roles.

**N2 — Ungated reference/list endpoints (accepted).** `getVillages`
(self-scoping), `getCapabilities`, `getCommunities`, `getDisabilities`,
`getVettingTypes` have no permission gates. All are low-sensitivity
reference data needed by multiple flows. Accepted as-is; listed for
completeness so the review doesn't rediscover them.

**N3 — Verified-good pairings worth asserting in review.** Delete person
(client `person:write` = API gate), notification send (client `sr:write` =
API `patchServiceRequest` gate), volunteer writes (client = API
`volunteer:write`), village detail (client = API `village:read`, post
seed fix). These four were individually confirmed against controller
source on 2026-07-11.
