import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'

// Analytics event ingestion is open to any authenticated caller (no admin gate);
// the body is an array of AnalyticsEvent and a successful post returns 204.
test('POST /op/analytics/events records events -> 204', async () => {
  const { status } = await vgCall('postEvents', {}, {
    token: tokens.users.full_v1,
    body: [{ eventType: 'page_view', path: '/dashboard', routeName: 'dashboard' }],
  })
  assert.equal(status, 204)
})

test('POST /op/analytics/events with no token -> 401', async () => {
  const { status } = await vgCall('postEvents', {}, {
    body: [{ eventType: 'interaction', eventName: 'click' }],
  })
  assert.equal(status, 401)
})
