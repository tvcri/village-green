import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'

// A stateless geocode proxy: it writes nothing and asks Census which
// municipality governs an address. All three cases here assert only what the
// OAS layer enforces before the controller runs (auth, missing fields,
// unknown properties) — none of them reach resolveTown() or the network.
// See service/TownResolutionService.js (Task 1) for interpretation coverage.

const VALID_BODY = { street: '150 Main St', city: 'Wakefield', state: 'RI', zip: '02879' }

test('POST /op/geocode/town with a token lacking vg:read -> 403', async () => {
  // readOnly carries per-resource :read scopes only — no generic vg:read.
  const { status } = await vgCall('geocodeTown', {}, {
    token: tokens.special.readOnly,
    body: VALID_BODY,
  })
  assert.equal(status, 403)
})

test('POST /op/geocode/town with a body missing required fields -> 400', async () => {
  const { status } = await vgCall('geocodeTown', {}, {
    token: tokens.users.full_v1,
    body: { street: '150 Main St' },
  })
  assert.equal(status, 400)
})

test('POST /op/geocode/town rejects unknown properties -> 400', async () => {
  const { status } = await vgCall('geocodeTown', {}, {
    token: tokens.users.full_v1,
    body: { ...VALID_BODY, personId: 1 },
  })
  assert.equal(status, 400)
})
