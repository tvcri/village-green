import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../lib/client.js'
import { tokens } from '../lib/context.js'

// The Member controller is fully stubbed (every handler returns res.json({})).
// But the framework's authentication + scope layer runs BEFORE the controller,
// so the gating asserted here is REAL, current behavior (GREEN) regardless of
// the stub. The stubbed *body* behavior is specced as todos in lifecycle.test.js.

const MEMBERS = '/members'

test('GET /members with no token -> 401', async () => {
  const { status } = await vgFetch(MEMBERS)
  assert.equal(status, 401)
})

test('GET /members with a valid token lacking vg:member scope -> 403', async () => {
  // readOnly carries `vg:service-request:read vg:village:read vg:person:read` —
  // no member scope at all, so the scope check denies before reaching the handler.
  const { status } = await vgFetch(MEMBERS, { token: tokens.special.readOnly })
  assert.equal(status, 403)
})

test('GET /members with full scope -> 200 (reaches the stubbed handler)', async () => {
  const { status } = await vgFetch(MEMBERS, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
})
