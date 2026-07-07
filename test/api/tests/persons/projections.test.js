import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { persons } from '../../setup/fixtures.js'

// Each `?projection=` option expands the response with extra data. Exercised in
// an authorized (own-village) context — the cross-village leak *via* projections
// is finding #1, asserted in authz.test.js.

test('person projection=memberInfo expands member details', async () => {
  const { status, json } = await vgFetch(`/persons/${persons.quahogMember.id}`, {
    token: tokens.users.full_v1, query: { projection: ['memberInfo'] },
  })
  assert.equal(status, 200)
  // Truthiness, not key presence: the projection is a SQL subquery alias, so the
  // key exists (as null) even when the underlying view/join returns nothing.
  assert.ok(json.memberInfo, 'memberInfo projected with data (quahogMember is Active)')
})

test('person projection=volunteerInfo expands volunteer details', async () => {
  const { status, json } = await vgFetch(`/persons/${persons.quahogVolunteer.id}`, {
    token: tokens.users.full_v1, query: { projection: ['volunteerInfo'] },
  })
  assert.equal(status, 200)
  // Truthiness for the same reason as memberInfo above.
  assert.ok(json.volunteerInfo, 'volunteerInfo projected with data (quahogVolunteer is active)')
})
