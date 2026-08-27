# Village Green — project guidance

## What this project is

Village Green serves **one customer** as **one deployment**. @csmig is the sole
developer. There is no fleet, no second install, no other team.

**This is not STIG Manager.** The two share a parent directory, a
Node/Express + MySQL + OIDC stack, and about four lines of inherited dead
scaffold (the `/docs` Sphinx mount). Nothing else. Do not import STIG
Manager's assumptions — multi-deployment compatibility, fleet upgrade paths,
multi-developer coordination, hundreds of installs. Those are correct there
and actively wrong here. Reason about *this* deployment: the one snapshot
that exists is the one that is tested.

**This is not a licence to be sloppy.** Fewer deployments means fewer
*compatibility* constraints, not a lower correctness bar. Enforcement gaps
are defects to fix, tests are wanted, and review should be rigorous. What is
unwanted is effort spent on an environment that does not exist: hedging
migrations against other installs, fleet-safe rollout plans, or security
findings about inert scaffold.

## Plans & specs go in `scratch/`

Superpowers artifacts — brainstorming specs, implementation plans, handoffs —
are written to **`scratch/superpowers/`**, never `docs/superpowers/`:

- Plans: `scratch/superpowers/plans/YYYY-MM-DD-<feature>.md`
- Specs: `scratch/superpowers/specs/YYYY-MM-DD-<topic>-design.md`

`scratch/` is gitignored working space. The superpowers skill defaults toward
`docs/`, so this needs deciding **before** the file is written, not corrected
after it is staged. `docs/superpowers/` is now gitignored as well, but five
legacy files there are already tracked — leave them; do not move or delete
them, and do not add new ones.

## Merge is deploy

A squash-merge to `main` is **in production within about a minute**: the merge
builds a container, Docker Hub fires an Azure webhook, and the app restarts on
the new image. There is no staging tier, no release train, no separate deploy
step to schedule or wait for.

Two consequences. **Merge date == production date** — when dating a feature's
go-live for reporting, the PR merge date is the answer. And **merging is the
risky moment**, not some later ceremony: a merged regression is live
immediately, which is why review happens before the merge rather than before a
release.

## Interaction rules

**Questions are questions, not commands.** When the user asks a question — including "why", "how", "is this possible", "does X work" — answer it and stop. Do not make code changes, propose fixes, or begin implementation. The user will use imperative language ("fix", "change", "add", "update") when they want action.

## Project board draft issues

When the user asks to **add a project draft issue** (or "add this to the
board", "make a draft issue", or similar) for the tvcri project board
(<https://github.com/orgs/tvcri/projects/1>), use the **`/add-draft-issue`**
slash command. Its instructions cover titling, field triage, and the helper
script — follow them rather than hand-writing GraphQL.

The board's backlog originates from `.claude/todo.md`. Adding a draft issue via
the command affects the **board only**; it does not edit `todo.md`. Keep
`todo.md` as the human-maintained backlog and add items there separately when
the user wants them tracked in the file too.

## Database migrations & the fresh-install scaffold

`api/source/service/migrations/sql/current/10-vg-tables.sql` and
`20-vg-static.sql` are **generated** — never hand-edit them (and during a
merge conflict always `git checkout --ours`). They are how a fresh install
builds its schema, and the `test/api` harness boots off them too.

They are **not** regenerated automatically. After adding a migration:

1. Migrate a DB to head — see "Verifying a new migration" below.
2. Run `api/source/service/migrations/sql/generateSchema.sh --container
   [name]` (defaults to `village-green-orch-db-1`, or set
   `VG_SCHEMA_DB_CONTAINER`). The flag re-execs the script inside the
   container so `mysqldump` matches the server version. Any container name
   works, including the `test/api` stack's — set `VG_SCHEMA_DB_NAME` when the
   source database isn't named `vg`, e.g. `vg_test` for that harness.
3. Commit both regenerated files.

### Verifying a new migration

Use the **`test/api` harness**, which brings up its own MySQL (port 3307,
database `vg_test`) and its own API from `test/api/docker-compose.yml`. Its
scaffold marks `0001`–`00NN` executed, so a *new* migration runs its real
`up()` there. `npm run test:keep` leaves the DB container up afterward, so
the scaffold can be regenerated from it.

**Never ask the user to restore a dump, restart the dev API, or migrate the
dev stack for migration work.** The harness is self-contained and needs
nothing from the dev environment. (Editing an *already-applied* migration in
place is the one case that still needs a pre-migration dump restore — that
is the user's call, not something to assume.)

If the migration seeds **catalog rows**, also add its table(s) to
`static_data_tables` in `generateSchema.sh`. Otherwise the dump marks the
migration executed in `_migrations` while carrying none of its rows, and a
fresh install comes up with that catalog empty — how the 0013 role catalog
went missing until PR #69 (every `role_grant` insert hit
`fk_role_grant_role`). Per-install *data migrations* (e.g. 0013's
`role_grant` / `village_grant` backfill) stay out of the list: dumping them
would ship one deployment's rows to every other.

## Service request statuses — the seven

`service_request.status` is **`varchar(50)`, not a MySQL enum**, and no
single file lists all seven values. Do not infer the vocabulary from any
list you happen to find — several deliberately-narrowed subsets exist and
each one looks authoritative on its own. The complete set is:

| Status | Written by | Notes |
|---|---|---|
| `Open` | derived | no volunteer assigned |
| `Confirmed` | derived | volunteer assigned |
| `Completed` | client | end state |
| `Unmatched` | scheduled event | end state |
| `Member cancelled` | client | end state |
| `Volunteer cancelled` | client | end state |
| `Hub cancelled` | client | end state |

**Seven values.** Some views roll the three cancels into a single
"Cancelled" bucket — that is a presentation choice, never the vocabulary.
`Open` and `Confirmed` are **never posted** —
`deriveStatus()` in `ServiceRequestService.js` computes them from
`volunteerPersonId`, which is why the OAS `status` enum lists only the four
client-writable values. `evt_auto_complete_service_requests` rewrites
in-flight rows to `Completed`/`Unmatched` the day after `serviceDate`.

**The narrowed subsets, and why each is narrow.** Reading one of these as
the vocabulary is a real mistake that has been made:

- `dbUtils.TERMINAL_SR_STATUSES` (`utils.js`) — **four**: excludes
  `Open`/`Confirmed` because they are still in flight and the auto-complete
  event rewrites them, making a report irreproducible; excludes
  `Hub cancelled` because those are treated as if the request never existed.
  This is a *metrics reporting* rule, **not** the status vocabulary.
- OAS `status` enum — **four**: the client-*writable* subset only.
- `CANCELLED_STATUSES` / `END_STATES` / `NON_NOTIFIABLE_STATUSES`
  (`ServiceRequestService.js`) — behavioral groupings, not vocabularies.
- `metricsView.js` `STATUS_ORDER` — the four terminal keys in camelCase;
  a `byStatus` payload structurally cannot carry `open`/`confirmed`.

**Consequence for dashboards:** any view that wants in-flight counts
(`Open`, `Confirmed`) cannot be built on `/village/metrics`. That endpoint
excludes them by design, and the exclusion is a considered reproducibility
rule — widening it is a decision to raise with the user, not a bug to fix.

## Service request dates & times

`service_request.serviceDate` (DATE) and the four TIME columns
(`startTime`, `finishTime`, `apptTime`, `returnTime`) are **wall-clock
civil values**, not instants. They pass through API and client as plain
strings (`YYYY-MM-DD`, `HH:MM:SS`). Never construct a JS `Date` from
them and never timezone-convert them — use the helpers in
`client/src/features/ServiceRequestList/lib/timeFields.js`.
`timesFlexible` records "no specific times" explicitly. `createdAt`
and other event timestamps remain UTC instants.

**Times are a Rides-only concept.** Of the `serviceName` values, only the
five `Ride: *` services have times; Errand, Home Help, and Tech Support
requests display no time inputs at all. `ServiceRequestCreateEdit.vue`
sets `timesFlexible: isRideService ? form.timesFlexible : true`, nulling
the TIME columns for every non-Ride. This hardcode is **correct, not a
bug** — a "complete" non-Ride request has no times and is not missing
anything. Do not flag it, and do not propose time inputs for non-Ride
services.

## Person name display

Inside running text (sentences, dialogs, toasts) a name reads
**"First Last"**; tables and labeled card fields keep **"Last, First"**
(exactly `person.fullName`, the stored generated column
`CONCAT_WS(', ', lastName, firstName)`). Never string-unparse `fullName`
to get the informal form — serve `firstName`/`lastName` alongside it and
compose client-side. Emergency-contact names are free-text and exempt.

## Who's who — coordinator vs volunteer vs member

Three distinct roles that are easy to conflate in user-facing copy. Getting
these wrong reads as a category error to the customer, and a grep won't
catch it.

- **Service coordinator** — enters and manages service requests. This is the
  person at the keyboard in any create/edit screen. Recorded as
  `service_request.createdUserId` (a `user_data` row), **not** as a person
  on the request. There are only ~12 of them across 8,600+ requests.
- **Volunteer** — *drives*. Assigned to a request as
  `volunteerPersonId`; sees ride details, never the entry form.
- **Member** — the person receiving the service. `memberPersonId`.

So: a coordinator *picks a destination*; a volunteer *drives to it*. Copy
about search results, form fields, or data entry says **coordinator**; copy
about what someone sees on the road says **volunteer**. Dual-role people
exist (member and volunteer both), which is why
[village role counts overlap by design].

**Service requests are created and managed at the federation level.**
Coordinators are not attached to a local village — they handle requests
across all 13. Local coordination may be supported eventually; it is not
how it works today. Do not scope coordinator-facing features by "their"
village. Any village scoping derives from the **member on the request**,
never from who is logged in.

## UI vocabulary vs data vocabulary

Two terms deliberately differ between what the UI displays and what the
code/schema calls them. Both are **intentional — do not "fix" either by
renaming one side to match the other**, and when adding related code, keep
the split.

- **`town` → UI says "Municipality".** The `person.town` column,
  `TownResolutionService.js`, and `POST /op/geocode/town` all keep `town`.
  Every user-facing string says *Municipality*: the form label, the
  detail-card label, and the Member/Volunteer CSV + Google Sheets column
  header. Reason: the roster's municipalities include seven RI cities
  (Providence, Cranston, Warwick, Pawtucket, Newport, Woonsocket, Central
  Falls) alongside towns, and the value stored is Census's `BASENAME` — the
  name with its type suffix already removed. "Municipality" is the only term
  correct for both. The field is free-form and read-only in the UI; it is
  calculated from the person's address.
- **`federation` → UI says "Hub" or "TVCRI", depending on audience.** API
  vocabulary is unchanged. The display term is **three-way**, and picking
  between the two UI words is about who is being addressed:
  - `federation` — code, schema, API. Never user-facing.
  - **Hub** — when a village refers to the federation it belongs to. An
    inward, relational term: the hub this village is part of.
  - **TVCRI** — when the text addresses or describes the organization to
    outsiders, or reports on the organization as a whole. Advocacy copy,
    outreach, and org-wide report titles say TVCRI; to a civic leader or a
    funder the organization has a name, and "the Hub" is internal
    vocabulary leaking out.

  Getting this wrong is invisible to a grep for either word, so decide by
  audience whenever new user-facing text names the federation.

Because the UI term is unguessable from the code term, grepping the display
word finds only a handful of lines. Search the data term when tracing these
features end to end.

## API conventions

- **Transaction read-back:** a `retryOnDeadlock2` `transactionFn` returns
  only the new/affected id — never the fetched record. Helpers like
  `getServiceRequest()` run on a separate pool connection, so a read-back
  inside the open transaction returns `null` under REPEATABLE READ and
  serializes as an empty response body. The controller fetches after
  commit.
- **Always-include vs `?projection=`:** if a response field is
  structurally required by one specific consumer (e.g. bootstrap), include
  it unconditionally. Reserve opt-in projection params for fields that are
  genuinely expensive or genuinely optional across multiple callers.
- **`*Detail` projections query base tables** (`member`, `volunteer`),
  never the `active_*` views — detail pages are exactly where an admin
  looks up a dropped member or inactive volunteer, and the view's status
  filter makes that data silently vanish. `*Info` projections
  intentionally use the views.
- **`active_member`/`active_volunteer` are `SELECT *` views** and MySQL
  expands `*` at view-creation time. Any migration adding columns to
  `member` or `volunteer` must end with the corresponding
  `CREATE OR REPLACE VIEW active_... AS SELECT * FROM ...` or the new
  column reads as NULL through the view with no error.

## MySQL / OAS traps

- `JSON_ARRAYAGG(DISTINCT ...)` is MariaDB-only; MySQL throws
  `ER_PARSE_ERROR`. Use `dbUtils.jsonArrayAggDistinct('col')`; it returns
  NULL (not `[]`) for zero rows — wrap in `COALESCE(..., JSON_ARRAY())`
  when the schema requires an array.
- Bare `TRUE`/`FALSE` inside `JSON_OBJECT(...)` serialize as JSON integers
  0/1 and fail OAS `boolean` validation. Fix: `CAST('true' AS JSON)` /
  `CAST('false' AS JSON)` per branch, or produce the value as a comparison
  expression. `CAST(<bool-expr> AS JSON)` does NOT fix it.
- Reason about driver behavior from **this app's pool**
  (`getPoolConfig()` in `api/source/service/utils.js`), never a bare
  mysql2 connection: the pool sets `decimalNumbers: true` (so `SUM()`
  returns a number — no CAST needed), a BIT(1)→boolean `typeCast` (the
  mysql CLI renders BIT as a non-printing byte — check with `HEX(col)`),
  `group_concat_max_len=10000000`, and `timezone: 'Z'`.
- `coerceTypes: false` in middlewares.js affects **request bodies only**.
  Path/query params with typed schemas are always coerced by
  express-openapi-validator — never write `=== 'true'`-style string
  comparisons for them in controllers.
