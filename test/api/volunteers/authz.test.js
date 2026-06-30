import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../lib/client.js'
import { tokens } from '../lib/context.js'

// The Volunteer controller is fully stubbed (every handler returns res.json({})).
// The framework authentication + scope layer runs BEFORE the controller, so the
// gating asserted here is REAL, current behavior (GREEN). Stubbed body behavior
// is specced as todos in lifecycle.test.js.
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
