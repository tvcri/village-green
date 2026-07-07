import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { persons } from '../../setup/fixtures.js'

// The member role is a person sub-resource: PUT/PATCH/DELETE /persons/{id}/member
// (the flat /members collection this suite originally specced was never built).
// The framework's authentication + scope layer runs BEFORE the controller, so the
// gating asserted here is REAL, current behavior (GREEN). DELETE is the probe:
// it needs no body (no OpenAPI 400 ahead of the authz check), and probing a
// person who holds no member role is non-destructive — reaching the handler
// yields its memberExists 404, proving authn + scope passed.

const MEMBER = `/persons/${persons.quahogVolunteer.id}/member` // a volunteer; never a member

test('DELETE /persons/{id}/member with no token -> 401', async () => {
  const { status } = await vgFetch(MEMBER, { method: 'DELETE' })
  assert.equal(status, 401)
})

test('DELETE /persons/{id}/member with a valid token lacking vg:member scope -> 403', async () => {
  // readOnly carries `vg:service-request:read vg:village:read vg:person:read` —
  // no member scope at all, so the scope check denies before reaching the handler.
  const { status } = await vgFetch(MEMBER, { token: tokens.special.readOnly, method: 'DELETE' })
  assert.equal(status, 403)
})

test('DELETE /persons/{id}/member with full scope reaches the handler (404: not a member)', async () => {
  const { status } = await vgFetch(MEMBER, { token: tokens.users.full_v1, method: 'DELETE' })
  assert.equal(status, 404)
})
