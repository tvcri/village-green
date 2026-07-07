import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'

// Authentication + scope gating on GET /volunteers. The framework auth layer
// runs BEFORE the controller, so this is independent of handler behavior; the
// list contents and the person-scoped write endpoints are covered in
// lifecycle.test.js.
const VOLUNTEERS = '/volunteers'

test('GET /volunteers with no token -> 401', async () => {
  const { status } = await vgFetch(VOLUNTEERS)
  assert.equal(status, 401)
})

test('GET /volunteers with a valid token lacking vg:volunteer scope -> 403', async () => {
  // readOnly carries service-request/village/person read scopes only — no volunteer scope.
  const { status } = await vgFetch(VOLUNTEERS, { token: tokens.special.readOnly })
  assert.equal(status, 403)
})

test('GET /volunteers with full scope -> 200 (reaches the stubbed handler)', async () => {
  const { status } = await vgFetch(VOLUNTEERS, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
})
