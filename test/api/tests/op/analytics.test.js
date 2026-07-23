import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'

// Analytics summary requires app:admin + elevate=true (Analytics.getSummary
// gates on hasElevatedPermission); event posting is open to any authenticated
// caller.

test('GET /op/analytics/summary as a non-admin -> 403', async () => {
  const { status } = await vgCall('getSummary', {}, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('GET /op/analytics/summary as admin WITHOUT elevate -> 403', async () => {
  const { status } = await vgCall('getSummary', {}, { token: tokens.users.admin })
  assert.equal(status, 403)
})

test('GET /op/analytics/summary as admin+elevate -> 200', async () => {
  // from/to are date-time (not date) per the schema.
  const { status } = await vgCall('getSummary',
    { elevate: 'true', from: '2026-01-01T00:00:00Z', to: '2026-12-31T23:59:59Z' },
    { token: tokens.users.admin })
  assert.equal(status, 200)
})

test('GET /op/analytics/summary with no token -> 401', async () => {
  const { status } = await vgCall('getSummary')
  assert.equal(status, 401)
})
