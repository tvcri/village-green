import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { persons } from '../../setup/fixtures.js'

// The member role is a person sub-resource: PUT/PATCH/DELETE /persons/{id}/member.
// Gating layers, in order: token authn (401) -> OAuth scope (403) -> existence
// (404: person or member row missing) -> member:write on the person's home
// village (403; post-#56 held only by federation Staff / Admin). DELETE is the
// probe: it needs no body (no OpenAPI 400 ahead of the gates), and probing a
// person who holds no member role is non-destructive.

const personId = persons.quahogVolunteer.id // a volunteer; never a member

test('DELETE /persons/{id}/member with no token -> 401', async () => {
  const { status } = await vgCall('deletePersonMember', { personId })
  assert.equal(status, 401)
})

test('DELETE /persons/{id}/member with a valid token lacking vg:member scope -> 403', async () => {
  // readOnly carries `vg:service-request:read vg:village:read vg:person:read` —
  // no member scope at all, so the scope check denies before reaching the handler.
  const { status } = await vgCall('deletePersonMember', { personId }, { token: tokens.special.readOnly })
  assert.equal(status, 403)
})

test('DELETE /persons/{id}/member on a non-member reaches the handler (404 precedes the perm gate)', async () => {
  // Existence (person + member row) is checked BEFORE member:write, so even a
  // read-only village user gets the 404 here — proving authn + scope passed.
  const { status } = await vgCall('deletePersonMember', { personId }, { token: tokens.users.full_v1 })
  assert.equal(status, 404)
})

test('DELETE /persons/{id}/member on a real member by a village user -> 403 (member:write is federation-only)', async () => {
  // quahogMember holds the member role; full_v1 is village-scoped (read-only
  // post-#56), so the perm gate denies after existence passes. Non-destructive.
  const { status } = await vgCall('deletePersonMember', { personId: persons.quahogMember.id }, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})
