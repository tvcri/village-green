import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withDb } from '../../lib/db.js'
import { serviceRequests as sr } from '../../setup/fixtures.js'

// The harness scaffold marks 0032 executed, so its backfill never sees fixture
// rows; seed.js inserts the child rows the backfill would have. These pin that
// seeded state (and the shape of the table), not the migration's SQL: the
// backfill itself is proven against a production dump.

const destinationsOf = (id) => withDb(async (conn) => {
  const [rows] = await conn.query(
    `SELECT destination, address, city, state, zip, phone
     FROM service_request_destination WHERE serviceRequestId = ? ORDER BY id`, [id])
  return rows
})

test('backfill: a fixture ride has one destination row matching its flat columns', async () => {
  const rows = await destinationsOf(sr.srM1.id)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].destination, sr.srM1.destination)
  assert.ok(sr.srM1.destination, 'fixture has a destination to match')
})

test('backfill: a Tech Support fixture has no destination rows', async () => {
  assert.equal(sr.srM7.serviceName, 'Tech Support')
  assert.deepEqual(await destinationsOf(sr.srM7.id), [])
})
