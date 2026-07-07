import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { exportAppData, importAppData, parseAppData } from '../../lib/appdata.js'
import { serviceRequests as sr, persons } from '../../setup/fixtures.js'

// Round trip: export -> import the same file -> re-export -> compare. Proves the
// import path works end-to-end and that export/import is lossless over the
// seeded dataset. Importing truncates + reloads every table in the file, so
// importing the *current state* leaves the canonical fixtures intact for the
// test files that run after this one.
//
// user_data is compared by identity (username set) rather than full rows: its
// lastAccess/lastClaims columns churn on every authenticated request, including
// the import call itself.

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

  for (const [table, aRows] of a.tables) {
    const bRows = b.tables.get(table)
    if (table === 'user_data') {
      const usernameIdx = a.columns.get(table).split(',').indexOf('`username`')
      assert.ok(usernameIdx >= 0, 'user_data export includes username')
      const names = rows => rows.map(r => JSON.parse(r)[usernameIdx]).sort()
      assert.deepEqual(names(bRows), names(aRows), 'user_data identities survive the round trip')
    } else {
      // row order within a table is not guaranteed; compare as sorted multisets
      assert.deepEqual([...bRows].sort(), [...aRows].sort(), `table ${table} differs after round trip`)
    }
  }
})

test('canonical fixtures are still served after the round-trip import', async () => {
  const srs = await vgFetch('/service-requests', { token: tokens.users.full_v1 })
  assert.equal(srs.status, 200)
  assert.ok(srs.json.map(r => r.serviceRequestId).includes(String(sr.srV1.id)),
    'srV1 still visible to full_v1')

  const person = await vgFetch(`/persons/${persons.quahogMember.id}`, { token: tokens.users.full_v1 })
  assert.equal(person.status, 200)
  assert.equal(person.json.fullName, persons.quahogMember.fullName)
})
