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

test('POST /op/analytics/events accepts a valid deviceClass -> 204', async () => {
  const { status } = await vgCall('postEvents', {}, {
    token: tokens.users.full_v1,
    body: [{ eventType: 'page_view', path: '/dashboard', routeName: 'dashboard', deviceClass: 'mobile' }],
  })
  assert.equal(status, 204)
})

test('POST /op/analytics/events accepts events with no deviceClass -> 204', async () => {
  // Older clients omit the field entirely; the column goes NULL.
  const { status } = await vgCall('postEvents', {}, {
    token: tokens.users.full_v1,
    body: [{ eventType: 'page_view', path: '/dashboard', routeName: 'dashboard' }],
  })
  assert.equal(status, 204)
})

// The enum is load-bearing: it is what stops a malformed client from writing
// junk into a column the summary groups on.
test('POST /op/analytics/events rejects an out-of-enum deviceClass -> 400', async () => {
  const { status } = await vgCall('postEvents', {}, {
    token: tokens.users.full_v1,
    body: [{ eventType: 'page_view', routeName: 'dashboard', deviceClass: 'toaster' }],
  })
  assert.equal(status, 400)
})

// Without additionalProperties:false a misspelled property name is silently
// accepted and the data is lost with a 204 — the invisible failure mode.
test('POST /op/analytics/events rejects an unknown property -> 400', async () => {
  const { status } = await vgCall('postEvents', {}, {
    token: tokens.users.full_v1,
    body: [{ eventType: 'page_view', routeName: 'dashboard', devicecClass: 'mobile' }],
  })
  assert.equal(status, 400)
})
