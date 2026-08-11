import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// Status-aware metrics (spec 2026-07-26): byServiceType carries a per-status
// matrix + derived category; byCategory is a fixed, zero-filled 4-entry array.
// Range 2026-06 isolates the srM* fixture rows (srV1 is 2026-07-10).
const RANGE = { start: '2026-06-01', end: '2026-06-30' }
// 'Member Added' was retired in 2026-08 (see SERVICE_CATEGORIES in
// api/source/service/utils.js): uncreatable in the UI, and its historical rows
// were deleted from production, so it is no longer zero-filled into byCategory.
const CATEGORIES = ['Rides', 'Errands', 'Home Help', 'Tech Support']
const ZERO = { completed: 0, unmatched: 0, memberCancelled: 0, volunteerCancelled: 0 }

async function getMetrics () {
  const { status, json } = await vgCall('getVillageMetrics',
    { villageId: villages.quahog.id, ...RANGE }, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  return json
}

test('byCategory: always all 4 categories in fixed order, zero-filled', async () => {
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
  // srM8 completed round-trip errand; srM4 is Open and no longer counted
  assert.deepEqual(errands, { ...ZERO, completed: 1 })
})

test('completedRoundTrips counts completed round-trip RIDES only, at every site', async () => {
  const m = await getMetrics()
  // srM1 is the only qualifying row: srM2 is One Way, srM3 isn't Completed,
  // srM8 is a completed Round Trip but an Errand (the legacy counter never
  // doubled non-ride round trips).
  assert.equal(m.totals.completedRoundTrips, 1)
  assert.equal(m.byCategory.find(c => c.category === 'Rides').completedRoundTrips, 1)
  assert.equal(m.byCategory.find(c => c.category === 'Errands').completedRoundTrips, 0)
  assert.equal(m.byCategory.find(c => c.category === 'Tech Support').completedRoundTrips, 0)
  assert.equal(m.byServiceType.find(e => e.serviceName === 'Ride: Medical Appnt').completedRoundTrips, 1)
  assert.equal(m.byServiceType.find(e => e.serviceName === 'Errand: Shopping').completedRoundTrips, 0)
  // People sites carry it too (quahog member/volunteer share srM1)
  assert.equal(m.byMember[0].completedRoundTrips, 1)
  assert.equal(m.byVolunteer[0].completedRoundTrips, 1)
})

test('byServiceType: per-status matrix, derived category, terminal non-Completed rows included', async () => {
  const { byServiceType } = await getMetrics()
  const medical = byServiceType.find(e => e.serviceName === 'Ride: Medical Appnt')
  assert.equal(medical.category, 'Rides')
  assert.deepEqual(medical.byStatus, { ...ZERO, completed: 2, memberCancelled: 1 })
  assert.equal('count' in medical, false)
  // srM4 (Open) is excluded; the group survives on srM8's completed round trip
  const errand = byServiceType.find(e => e.serviceName === 'Errand: Shopping')
  assert.deepEqual(errand.byStatus, { ...ZERO, completed: 1 })
  // sort: completed desc puts the 2-completed Ride first
  assert.equal(byServiceType[0].serviceName, 'Ride: Medical Appnt')
})

test('non-terminal and Hub cancelled rows are excluded from every section', async () => {
  const m = await getMetrics()
  assert.equal(m.totals.byStatus.completed, 4) // srM1, srM2, srM5, srM8
  // srM1-3, srM5, srM8. srM6 is Hub cancelled and srM4 is Open — both invisible.
  assert.equal(m.totals.totalRequests, 5)
  const rides = m.byCategory.find(c => c.category === 'Rides').byStatus
  assert.equal(Object.values(rides).reduce((a, b) => a + b, 0), 3)

  // totalRequests is derived from byStatus, so the strip always reconciles.
  const summed = Object.values(m.totals.byStatus).reduce((a, b) => a + b, 0)
  assert.equal(m.totals.totalRequests, summed)

  // srM6 is a Hub-cancelled Tech Support row with no other in-range Tech
  // Support rows, so its exclusion is load-bearing: if the status filter were
  // ever dropped from VillageService, this row would surface as its own
  // visible byServiceType entry (it can't hide by merging into an existing
  // group, unlike a Hub-cancelled Ride would among srM1-3).
  assert.equal(m.byServiceType.find(e => e.serviceName === 'Tech Support'), undefined)
  // 3 serviceNames survive: Ride: Medical Appnt, Errand: Shopping, Household
  // Chores/Handy Help. Errand: Shopping survives on srM8 alone now that srM4
  // (Open) is excluded.
  assert.equal(m.byServiceType.length, 3)
  assert.deepEqual(m.byCategory.find(c => c.category === 'Tech Support').byStatus, ZERO)
})

test('byStatus carries only the four terminal statuses', async () => {
  const m = await getMetrics()
  const want = ['completed', 'unmatched', 'memberCancelled', 'volunteerCancelled']
  assert.deepEqual(Object.keys(m.totals.byStatus).sort(), [...want].sort())
  for (const c of m.byCategory) {
    assert.deepEqual(Object.keys(c.byStatus).sort(), [...want].sort())
  }
  for (const e of m.byServiceType) {
    assert.deepEqual(Object.keys(e.byStatus).sort(), [...want].sort())
  }
})

test('a non-terminal row is absent from byServiceType entirely', async () => {
  // srV1 'Ride to pharmacy' (2026-07-10) is Confirmed — still in flight, so
  // metrics no longer see it. It was previously this test's vehicle for the
  // unmapped-serviceName -> category null case; that mapping is still covered
  // by buildServiceNameCategoryCase, but no in-range terminal fixture row
  // exercises it, so this asserts the exclusion instead.
  const { status, json } = await vgCall('getVillageMetrics',
    { villageId: villages.quahog.id, start: '2026-07-10', end: '2026-07-10' },
    { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.equal(json.byServiceType.find(e => e.serviceName === 'Ride to pharmacy'), undefined)
  assert.equal(json.totals.totalRequests, 0)
  const total = json.byCategory.reduce((n, c) =>
    n + Object.values(c.byStatus).reduce((a, b) => a + b, 0), 0)
  assert.equal(total, 0)
})
