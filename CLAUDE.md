# Village Green — project guidance

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

1. Migrate a dev DB to head.
2. Run `api/source/service/migrations/sql/generateSchema.sh --container
   [name]` (defaults to `village-green-orch-db-1`, or set
   `VG_SCHEMA_DB_CONTAINER`). The flag re-execs the script inside the
   container so `mysqldump` matches the server version.
3. Commit both regenerated files.

If the migration seeds **catalog rows**, also add its table(s) to
`static_data_tables` in `generateSchema.sh`. Otherwise the dump marks the
migration executed in `_migrations` while carrying none of its rows, and a
fresh install comes up with that catalog empty — how the 0013 role catalog
went missing until PR #69 (every `role_grant` insert hit
`fk_role_grant_role`). Per-install *data migrations* (e.g. 0013's
`role_grant` / `village_grant` backfill) stay out of the list: dumping them
would ship one deployment's rows to every other.

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
