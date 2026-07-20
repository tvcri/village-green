import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'

// Smoke: the harness booted a real server that reached the `available` state and
// serves its own OpenAPI definition. (The 503-until-ready gate is exercised by
// run.js's readiness probe.)

test('GET /op/state reports available', async () => {
  const { status, json } = await vgCall('getState')
  assert.equal(status, 200)
  assert.equal(json.currentState, 'available')
})

test('GET /op/definition serves the OpenAPI document', async () => {
  const { status, json } = await vgCall('getDefinition')
  assert.equal(status, 200)
  assert.ok(json && (json.openapi || json.paths), 'should look like an OpenAPI document')
})

test('the static dump carries the 0013 role catalog (RED until generateSchema.sh is fixed)', async () => {
  // RED — scratch/bug-report-2026-07-20.md (bug 2): sql/generateSchema.sh's
  // static_data_tables list was never updated for migration 0013's new static
  // tables, so 20-vg-static.sql marks 0013 as executed in _migrations while
  // carrying zero role / role_permission rows. Any fresh scaffold then has an
  // empty role catalog and every role_grant insert hits fk_role_grant_role —
  // new installs cannot grant anyone anything. The harness works around it
  // (setup/seed.js seedRoleCatalog); this static check on the dump artifact
  // stays red until the dump is regenerated with the tables added — then
  // delete seedRoleCatalog(). Checked on disk (not via the DB) so the verdict
  // is immune to --keep re-runs inheriting the workaround's rows.
  const { readFile } = await import('node:fs/promises')
  const path = await import('node:path')
  const { config } = await import('../../setup/env.js')
  const dump = await readFile(path.join(
    config.apiSourceDir, 'service', 'migrations', 'sql', 'current', '20-vg-static.sql'), 'utf8')
  if (!dump.includes('0013-rbac-roles.js')) return // dump predates 0013; nothing to assert
  assert.ok(/INSERT INTO `?role`? /.test(dump),
    'dump marks 0013 executed but has no role rows (fresh installs get an empty role catalog)')
  assert.ok(/INSERT INTO `?role_permission`? /.test(dump),
    'dump marks 0013 executed but has no role_permission rows')
})
