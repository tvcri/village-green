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
