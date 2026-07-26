import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, persons } from '../../setup/fixtures.js'

// deleteServiceRequest is gated on sr:write for the SR's village — NOT on who
// created it. Pinned by creating as sc and deleting as staff (a different
// sr:write holder).
test('any sr:write holder can delete, not just the creator', async () => {
  const created = await vgCall('createServiceRequest', {}, {
    token: tokens.users.sc,
    body: {
      villageId: String(villages.quahog.id),
      memberPersonId: String(persons.quahogMember.id),
      serviceName: 'Disposable ride',
    },
  })
  assert.equal(created.status, 201)
  const serviceRequestId = created.json.serviceRequestId

  const del = await vgCall('deleteServiceRequest', { serviceRequestId }, { token: tokens.users.staff })
  assert.ok(del.status === 200 || del.status === 204, `expected delete success, got ${del.status}`)

  const after = await vgCall('getServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  assert.equal(after.status, 404, 'request is gone after delete')
})

// Village-scope roles are read-only post-#56: no delete, even in the granted village.
test('village user cannot delete a request in its own village', async () => {
  const created = await vgCall('createServiceRequest', {}, {
    token: tokens.users.sc,
    body: {
      villageId: String(villages.quahog.id),
      memberPersonId: String(persons.quahogMember.id),
      serviceName: 'Delete-denial probe',
    },
  })
  assert.equal(created.status, 201)
  const serviceRequestId = created.json.serviceRequestId

  const denied = await vgCall('deleteServiceRequest', { serviceRequestId }, { token: tokens.users.full_v1 })

  // Clean up regardless of outcome — the seeded DB is shared across files.
  await vgCall('deleteServiceRequest', { serviceRequestId }, { token: tokens.users.sc })

  assert.equal(denied.status, 403)
})
