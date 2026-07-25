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

// This is also the only end-to-end proof that deviceClass survives the POST
// and reaches the database — the events test could not assert that, because
// the summary counts are the sole way to observe it through the API.
//
// The four device columns partition totalVisits: every row is exactly one
// class, and pre-feature rows (deviceClass NULL) fold into unknownVisits.
test('GET /op/analytics/summary returns per-device counts that sum to totalVisits', async () => {
  await vgCall('postEvents', {}, {
    token: tokens.users.full_v1,
    body: [
      { eventType: 'page_view', routeName: 'device-count-probe', deviceClass: 'mobile' },
      { eventType: 'page_view', routeName: 'device-count-probe', deviceClass: 'mobile' },
      { eventType: 'page_view', routeName: 'device-count-probe', deviceClass: 'tablet' },
      { eventType: 'page_view', routeName: 'device-count-probe', deviceClass: 'desktop' },
      { eventType: 'page_view', routeName: 'device-count-probe' },
    ],
  })

  const { status, json } = await vgCall('getSummary',
    { elevate: 'true' },
    { token: tokens.users.admin })
  assert.equal(status, 200)

  const row = json.find(r => r.routeName === 'device-count-probe')
  assert.ok(row, 'expected a summary row for the probe route')
  assert.equal(row.mobileVisits, 2)
  assert.equal(row.tabletVisits, 1)
  assert.equal(row.desktopVisits, 1)
  assert.equal(row.unknownVisits, 1)
  assert.equal(
    row.mobileVisits + row.tabletVisits + row.desktopVisits + row.unknownVisits,
    row.totalVisits
  )
})

// Guards the CAST: without it MySQL returns DECIMAL, which the driver
// surfaces as a string and which fails the integer response schema.
test('GET /op/analytics/summary returns device counts as numbers, not strings', async () => {
  const { status, json } = await vgCall('getSummary',
    { elevate: 'true' },
    { token: tokens.users.admin })
  assert.equal(status, 200)
  assert.ok(json.length > 0, 'expected at least one summary row')
  for (const row of json) {
    assert.equal(typeof row.mobileVisits, 'number')
    assert.equal(typeof row.tabletVisits, 'number')
    assert.equal(typeof row.desktopVisits, 'number')
    assert.equal(typeof row.unknownVisits, 'number')
  }
})
