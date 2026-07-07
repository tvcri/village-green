import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { villages, persons } from '../../setup/fixtures.js'

const SR = '/service-requests'

// deleteServiceRequest happy path: create a disposable request in the caller's
// own village, delete it, confirm it's gone. (The cross-village delete-authz case
// follows the create/patch findings #2 and isn't re-probed here.)
test('deleteServiceRequest removes a request the caller created', async () => {
  const created = await vgFetch(SR, {
    token: tokens.users.full_v1,
    body: {
      villageId: String(villages.quahog.id),
      memberPersonId: String(persons.quahogMember.id),
      serviceName: 'Disposable ride',
    },
  })
  assert.equal(created.status, 201)
  const id = created.json.serviceRequestId

  const del = await vgFetch(`${SR}/${id}`, { token: tokens.users.full_v1, method: 'DELETE' })
  assert.ok(del.status === 200 || del.status === 204, `expected delete success, got ${del.status}`)

  const after = await vgFetch(`${SR}/${id}`, { token: tokens.users.full_v1 })
  assert.equal(after.status, 404, 'request is gone after delete')
})
