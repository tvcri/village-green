import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// Status-aware metrics (spec 2026-07-26): byServiceType carries a per-status
// matrix + derived category; byCategory is a fixed, zero-filled 5-entry array.
// Range 2026-06 isolates the srM* fixture rows (srV1 is 2026-07-10).
const RANGE = { start: '2026-06-01', end: '2026-06-30' }
const CATEGORIES = ['Rides', 'Errands', 'Home Help', 'Tech Support', 'Member Added']
const ZERO = { draft: 0, open: 0, confirmed: 0, completed: 0,
  unmatched: 0, memberCancelled: 0, volunteerCancelled: 0 }

async function getMetrics () {
  const { status, json } = await vgCall('getVillageMetrics',
    { villageId: villages.quahog.id, ...RANGE }, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  return json
}

test('byCategory: always all 5 categories in fixed order, zero-filled', async () => {
  const { byCategory } = await getMetrics()
  assert.deepEqual(byCategory.map(c => c.category), CATEGORIES)
  // Tech Support has no in-range rows (srM7 is 2025) -> present but all-zero
  assert.deepEqual(byCategory.find(c => c.category === 'Tech Support').byStatus, ZERO)
})

test('byCategory: per-status counts aggregate across serviceNames', async () => {
  const { byCategory } = await getMetrics()
  const rides = byCategory.find(c => c.category === 'Rides').byStatus
  // srM1+srM2 Completed, srM3 Member cancelled
  assert.deepEqual(rides, { ...ZERO, completed: 2, memberCancelled: 1 })
  const errands = byCategory.find(c => c.category === 'Errands').byStatus
  assert.deepEqual(errands, { ...ZERO, open: 1 })
})

test('byServiceType: per-status matrix, derived category, non-Completed rows included', async () => {
  const { byServiceType } = await getMetrics()
  const medical = byServiceType.find(e => e.serviceName === 'Ride: Medical Appnt')
  assert.equal(medical.category, 'Rides')
  assert.deepEqual(medical.byStatus, { ...ZERO, completed: 2, memberCancelled: 1 })
  assert.equal('count' in medical, false)
  // Open-only serviceName appears (previously Completed-only would drop it)
  const errand = byServiceType.find(e => e.serviceName === 'Errand: Shopping')
  assert.deepEqual(errand.byStatus, { ...ZERO, open: 1 })
  // sort: completed desc puts the 2-completed Ride first
  assert.equal(byServiceType[0].serviceName, 'Ride: Medical Appnt')
})

test('Hub cancelled is excluded from totals, byCategory, and byServiceType', async () => {
  const m = await getMetrics()
  assert.equal(m.totals.byStatus.completed, 3) // srM1, srM2, srM5
  assert.equal(m.totals.totalRequests, 5)      // srM1-5; srM6 hub-cancelled invisible
  const rides = m.byCategory.find(c => c.category === 'Rides').byStatus
  assert.equal(Object.values(rides).reduce((a, b) => a + b, 0), 3)

  // srM6 is a Hub-cancelled Tech Support row with no other in-range Tech
  // Support rows, so its exclusion is load-bearing here: if the status
  // filter were ever dropped from VillageService, this row would surface as
  // its own visible byServiceType entry (it can't hide by merging into an
  // existing group, unlike a Hub-cancelled Ride would among srM1-3).
  assert.equal(m.byServiceType.find(e => e.serviceName === 'Tech Support'), undefined)
  // Only the 3 non-hub-cancelled serviceNames from srM1-5 are present.
  assert.equal(m.byServiceType.length, 3)
  // Tech Support still appears in byCategory (fixed 5-category shape) but
  // entirely zero-filled, since srM6 is its only would-be contributor.
  assert.deepEqual(m.byCategory.find(c => c.category === 'Tech Support').byStatus, ZERO)
})

test('a serviceName outside the vocabulary yields category null (validated)', async () => {
  // srV1 'Ride to pharmacy' (2026-07-10) is unmapped: 'Ride to' != 'Ride:'.
  const { status, json } = await vgCall('getVillageMetrics',
    { villageId: villages.quahog.id, start: '2026-07-10', end: '2026-07-10' },
    { token: tokens.users.full_v1 })
  assert.equal(status, 200) // response validation accepts nullable category
  const legacy = json.byServiceType.find(e => e.serviceName === 'Ride to pharmacy')
  assert.equal(legacy.category, null)
  // ...and it contributes to NO byCategory bucket
  const total = json.byCategory.reduce((n, c) =>
    n + Object.values(c.byStatus).reduce((a, b) => a + b, 0), 0)
  assert.equal(total, 0)
})
