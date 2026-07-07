import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { villages, serviceRequests as sr, persons } from '../../setup/fixtures.js'

// Role tiers: 1=restricted, 2=full, 3=manage, 4=owner. roleId is NOT currently
// used for Village Green resource authorization — a grant of ANY role on a
// village confers the same access. (The only live roleId references are
// STIG-Manager vestigial code in utils.js and role-name mapping in
// OperationService.) These characterize that a grant's VILLAGE scope is enforced
// regardless of role, while the ROLE itself is not yet differentiated.
const SR = '/service-requests'

test('restricted (role 1) sees the same village roster as full (role 2)', async () => {
  const restricted = await vgFetch(SR, { token: tokens.users.restricted_v1 })
  const full = await vgFetch(SR, { token: tokens.users.full_v1 })
  assert.equal(restricted.status, 200)
  const rIds = restricted.json.map(r => r.serviceRequestId).sort()
  const fIds = full.json.map(r => r.serviceRequestId).sort()
  assert.deepEqual(rIds, fIds, 'restricted and full see the identical Quahog request set')
})

test('restricted (role 1) can read the Quahog person roster', async () => {
  const { status, json } = await vgFetch('/persons', { token: tokens.users.restricted_v1 })
  assert.equal(status, 200)
  assert.ok(json.map(p => p.fullName).includes(persons.quahogMember.fullName))
})

test('a grant scopes to its village regardless of role (restricted sees no Innsmouth)', async () => {
  const { json } = await vgFetch(SR, { token: tokens.users.restricted_v1 })
  const ids = json.map(r => r.serviceRequestId)
  assert.ok(!ids.includes(String(sr.srV2.id)), 'restricted_v1 (Quahog) must not see Innsmouth')
})

// SPEC (presumed intent): a "restricted" grant should be read-only. roleId is
// ignored on writes today, so a restricted user can still create — ride as a todo
// until the role semantics are defined and enforced. Cleans up any row it creates.
test('restricted (role 1) should not be able to create a service request',
  { todo: 'role tiers are not enforced; a restricted grant can currently write' }, async () => {
    const res = await vgFetch(SR, {
      token: tokens.users.restricted_v1,
      body: {
        villageId: String(villages.quahog.id),
        memberPersonId: String(persons.quahogMember.id),
        serviceName: 'restricted write attempt',
      },
    })
    if (res.status === 201 && res.json?.serviceRequestId) {
      await vgFetch(`${SR}/${res.json.serviceRequestId}`, { token: tokens.users.full_v1, method: 'DELETE' })
    }
    assert.equal(res.status, 403, 'a restricted grant should be read-only')
  })
