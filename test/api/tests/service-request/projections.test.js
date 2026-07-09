import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { serviceRequests as sr } from '../../setup/fixtures.js'

// Each `?projection=` option expands the response with extra data. Exercised in
// an authorized (own-village) context — the cross-village leak *via* projections
// is finding #1, asserted in authz.test.js.

test('SR projection=volunteerAddress expands the volunteer address', async () => {
  const { status, json } = await vgCall('getServiceRequest',
    { serviceRequestId: sr.srV1.id, projection: ['volunteerAddress'] },
    { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  // Truthiness, not key presence: the projection is a SQL subquery alias, so the
  // key exists (as null) even when the join returns nothing — and srV1's
  // volunteer has a seeded address.
  assert.ok(json.volunteerAddress, 'volunteerAddress projected with data')
})

test('SR projection=notificationHistory expands the notification history', async () => {
  const { status, json } = await vgCall('getServiceRequest',
    { serviceRequestId: sr.srV1.id, projection: ['notificationHistory'] },
    { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  // Key presence is the honest assertion here: srV1 has no seeded notification
  // events, so the projected value is legitimately empty.
  assert.ok('notificationHistory' in json, 'notificationHistory projected')
})
