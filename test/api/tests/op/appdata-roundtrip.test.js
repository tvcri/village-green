import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { exportAppData, importAppData, parseAppData } from '../../lib/appdata.js'
import { serviceRequests as sr, persons, villages } from '../../setup/fixtures.js'

// Round trip: export -> import the same file -> re-export -> compare. Proves the
// import path works end-to-end and that export/import is lossless over the
// seeded dataset. Importing truncates + reloads every table in the file, so
// importing the *current state* leaves the canonical fixtures intact for the
// test files that run after this one.
//
// user_data is compared with its lastAccess/lastClaims columns nulled out: they
// churn on every authenticated request, including the import call itself. Every
// other user_data column must survive the round trip verbatim.

test('appdata export -> import -> re-export round-trips losslessly', async () => {
  const before = await exportAppData(tokens.users.admin)

  const { status, progress } = await importAppData(tokens.users.admin, before)
  assert.equal(status, 200)
  assert.equal(progress.at(-1)?.status, 'success',
    `import did not report success; last progress record: ${JSON.stringify(progress.at(-1))}`)

  const after = await exportAppData(tokens.users.admin)
  const a = parseAppData(before)
  const b = parseAppData(after)

  assert.equal(b.meta.lastMigration, a.meta.lastMigration, 'same migration level')
  assert.deepEqual([...b.tables.keys()].sort(), [...a.tables.keys()].sort(), 'same table set')

  // Floor: the comparison below is vacuously true over an empty export, so pin
  // that the export actually contains the seeded dataset before comparing.
  for (const table of ['village', 'person', 'member', 'volunteer', 'service_request', 'user_data', 'role_grant']) {
    assert.ok(a.tables.get(table)?.length > 0, `export includes seeded ${table} rows`)
  }

  for (const [table, aRows] of a.tables) {
    const bRows = b.tables.get(table)
    if (table === 'user_data') {
      const cols = a.columns.get(table).split(',').map(c => c.replaceAll('`', ''))
      const churnIdx = ['lastAccess', 'lastClaims'].map(c => cols.indexOf(c))
      assert.ok(churnIdx.every(i => i >= 0), 'user_data export includes lastAccess/lastClaims')
      const scrubbed = rows => rows.map(r => {
        const vals = JSON.parse(r)
        for (const i of churnIdx) vals[i] = null
        return JSON.stringify(vals)
      }).sort()
      assert.deepEqual(scrubbed(bRows), scrubbed(aRows),
        'user_data rows (minus the per-request churn columns) survive the round trip')
    } else {
      // row order within a table is not guaranteed; compare as sorted multisets
      assert.deepEqual([...bRows].sort(), [...aRows].sort(), `table ${table} differs after round trip`)
    }
  }
})

test('canonical fixtures are still served after the round-trip import', async () => {
  // Post-#56 a village user must scope the list to a granted village.
  const srs = await vgCall('getServiceRequests',
    { villageId: [String(villages.quahog.id)] }, { token: tokens.users.full_v1 })
  assert.equal(srs.status, 200)
  assert.ok(srs.json.map(r => r.serviceRequestId).includes(String(sr.srV1.id)),
    'srV1 still visible to full_v1')

  const person = await vgCall('getPerson', { personId: persons.quahogMember.id }, { token: tokens.users.full_v1 })
  assert.equal(person.status, 200)
  assert.equal(person.json.fullName, persons.quahogMember.fullName)
})
