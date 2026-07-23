import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'

// Gating on GET /volunteers: token authn (401) -> OAuth scope (403) -> RBAC.
// The endpoint takes no villageId param — the controller scopes rows to the
// caller's volunteer:read grants (federation readers see all) and 403s a
// caller with volunteer:read nowhere. List contents and the person-scoped
// write endpoints are covered in lifecycle.test.js.

test('GET /volunteers with no token -> 401', async () => {
  const { status } = await vgCall('getVolunteers')
  assert.equal(status, 401)
})

test('GET /volunteers with a valid token lacking vg:volunteer scope -> 403', async () => {
  // readOnly carries service-request/village/person read scopes only — no volunteer scope.
  const { status } = await vgCall('getVolunteers', {}, { token: tokens.special.readOnly })
  assert.equal(status, 403)
})

test('GET /volunteers with volunteer:read on a village -> 200', async () => {
  const { status } = await vgCall('getVolunteers', {}, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
})

test('GET /volunteers with volunteer:read nowhere -> 403', async () => {
  const { status } = await vgCall('getVolunteers', {}, { token: tokens.users.nogrants })
  assert.equal(status, 403)
})
