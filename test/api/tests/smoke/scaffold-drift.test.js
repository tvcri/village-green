import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../../setup/env.js'
import { withDb } from '../../lib/db.js'

// Guards the fresh-install scaffold (sql/current/) against drifting behind the
// migrations. Those files are GENERATED — `generateSchema.sh --container` — and
// nothing regenerates them automatically, so a new migration is invisible to
// fresh installs until someone remembers. Three separate defects reached main
// this way before these tests existed:
//
//   1. the 0013 role catalog was marked executed but shipped no rows (#69)
//   2. the dump sat three migrations stale, missing enrollment_request (#69)
//   3. 30-vg-views.sql re-created views the dump already had, with SELECT *
//      overwriting the dump's column-expanded definitions (#71)
//
// Each was caught by a person noticing. These catch it in CI instead.
//
// The harness is the natural home: it boots the API against a throwaway DB,
// which scaffolds *from these very files*, so `vg_test` IS a fresh install.

const sqlDir = path.join(config.apiSourceDir, 'service', 'migrations', 'sql')
const migrationsDir = path.join(config.apiSourceDir, 'service', 'migrations')

const readDump = (name) => readFile(path.join(sqlDir, 'current', name), 'utf8')

// WHAT THIS FILE CAN AND CANNOT CHECK — read before adding to it.
//
// A "does the dump carry every table at head" check CANNOT be written from
// inside this harness. Three attempts were made and each was verified useless
// by simulating the actual drift:
//
//   1. "dump baselines every migration file" — unreachable. If it does not, the
//      API refuses to BOOT: it runs the un-baselined migration against a schema
//      the dump already built and dies on `Table 'x' already exists`. The tests
//      never run, so the assertion can never fire.
//   2. "every live table appears in the dump" — unfalsifiable. Strip a table
//      from 10-vg-tables.sql and its migration simply runs and creates it, so
//      the live schema is right either way.
//   3. "...with the migration also baselined" (the real finding-B shape) —
//      passes wrongly. The table is then absent from the dump AND from the live
//      DB, so comparing the two finds nothing to report.
//
// The root cause is circularity: setupSchema() scaffolds FROM these files
// (only when numTables === 0) and then migrates, so the live schema is a
// product of the dump, never an independent witness to it. Catching that class
// of drift needs a reference DB built by running the migrations from empty —
// which is exactly what the scaffold exists to avoid, and something this
// harness never does. It belongs in a separate CI job that migrates an empty DB
// and diffs the result against the dump, not here.
//
// What IS checkable here is drift the migration runner cannot heal, because the
// migration is baselined and its statements never run: static catalog ROWS
// (finding B's real damage) and VIEW definitions (re-created wholesale by
// whichever file loads last, silently). Those are below.

test('the active_* views survive the scaffold with column-expanded definitions', async () => {
  // Regression guard for the deleted 30-vg-views.sql (#71). mysqldump already
  // emits these views into 10-vg-tables.sql fully column-expanded; 30- re-created
  // them from `SELECT *` and, loading last, WON.
  //
  // Why that matters: MySQL freezes a view's column list at creation. The
  // expanded form is regenerated with the dump, so it tracks the base table.
  // A `SELECT *` form silently keeps whatever columns existed when it ran —
  // the "add a column to member/volunteer and it's invisible in active_*" trap.
  //
  // If someone re-adds a views file, this fails on the definition, not the
  // existence — which is the part that actually breaks.
  const views = await withDb(conn => conn.query(
    `SELECT TABLE_NAME t FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?`,
    [config.db.schema],
  ).then(([rows]) => rows.map(r => r.t)))

  for (const name of ['active_member', 'active_volunteer']) {
    assert.ok(views.includes(name),
      `${name} missing from a fresh scaffold — migration 0006 never runs on a fresh ` +
      'install (the dump baselines it), so 10-vg-tables.sql must carry the view')
  }

  // The base column each view would lose if it were re-created from SELECT *
  // before that column existed.
  for (const [view, column] of [['active_member', 'confidentialNotes'], ['active_volunteer', 'providerType']]) {
    const def = await withDb(conn => conn.query(`SHOW CREATE VIEW \`${view}\``)
      .then(([rows]) => rows[0]['Create View']))
    assert.ok(def.includes(`\`${column}\``),
      `${view} does not project ${column} — it looks re-created from SELECT * rather than ` +
      'taken from the mysqldump output. Do not add a views file to sql/current/; the dump has them.')
  }
})
