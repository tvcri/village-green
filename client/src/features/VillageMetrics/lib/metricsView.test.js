import { describe, it, expect } from 'vitest'
import {
  STATUS_ORDER, STATUS_LABELS, CATEGORY_COLORS, STATUS_OPTIONS,
  statusCount, legsApply, adjustedCount,
  categoryChart, serviceChart, outcomesChart, stripStats,
} from './metricsView.js'

// A hand-built fixture matching the VillageMetrics API payload shape
// (api/source/specification/village-green.yaml components.schemas.VillageMetrics).
function emptyStatus () {
  return { completed: 0, unmatched: 0, memberCancelled: 0, volunteerCancelled: 0 }
}

function makeMetrics () {
  return {
    villageId: '1',
    villageName: 'Test Village',
    range: { start: '2026-01-01', end: '2026-07-13' },
    totals: {
      totalRequests: 90,
      byStatus: { completed: 70, unmatched: 4, memberCancelled: 10, volunteerCancelled: 6 },
      completedRoundTrips: 8,
    },
    byCategory: [
      { category: 'Rides', byStatus: { ...emptyStatus(), completed: 40, memberCancelled: 5 }, completedRoundTrips: 6 },
      { category: 'Errands', byStatus: { ...emptyStatus(), completed: 20, volunteerCancelled: 2 }, completedRoundTrips: 2 },
      { category: 'Home Help', byStatus: { ...emptyStatus(), completed: 10 }, completedRoundTrips: 0 },
      { category: 'Tech Support', byStatus: { ...emptyStatus() }, completedRoundTrips: 0 },
      { category: 'Member Added', byStatus: { ...emptyStatus() }, completedRoundTrips: 0 },
    ],
    byServiceType: [
      { serviceName: 'Ride: Medical', category: 'Rides', byStatus: { ...emptyStatus(), completed: 30 }, completedRoundTrips: 5 },
      { serviceName: 'Ride: Social', category: 'Rides', byStatus: { ...emptyStatus(), completed: 10 }, completedRoundTrips: 1 },
      { serviceName: 'Errand: Grocery', category: 'Errands', byStatus: { ...emptyStatus(), completed: 19 }, completedRoundTrips: 2 },
      { serviceName: 'Tiny Errand', category: 'Errands', byStatus: { ...emptyStatus(), completed: 1 }, completedRoundTrips: 0 },
      { serviceName: 'Household Chores/Handy Help', category: 'Home Help', byStatus: { ...emptyStatus(), completed: 10 }, completedRoundTrips: 0 },
      { serviceName: 'Something Custom', category: null, byStatus: { ...emptyStatus(), completed: 5 }, completedRoundTrips: 0 },
    ],
    byMember: [],
    byVolunteer: [],
  }
}

describe('STATUS_ORDER / STATUS_LABELS / STATUS_OPTIONS', () => {
  it('has the 4-key canonical order — terminal statuses only', () => {
    expect(STATUS_ORDER).toEqual([
      'completed', 'unmatched', 'memberCancelled', 'volunteerCancelled',
    ])
  })

  it('labels every status', () => {
    expect(STATUS_LABELS).toEqual({
      completed: 'Completed',
      unmatched: 'Unmatched',
      memberCancelled: 'Member cancelled',
      volunteerCancelled: 'Volunteer cancelled',
    })
  })

  it('STATUS_OPTIONS leads with All statuses then mirrors STATUS_ORDER', () => {
    expect(STATUS_OPTIONS).toEqual([
      { label: 'All statuses', value: 'all' },
      { label: 'Completed', value: 'completed' },
      { label: 'Unmatched', value: 'unmatched' },
      { label: 'Member cancelled', value: 'memberCancelled' },
      { label: 'Volunteer cancelled', value: 'volunteerCancelled' },
    ])
  })
})

describe('CATEGORY_COLORS', () => {
  it('has the 5 category hues (mirrors VolunteerHome --cat-* vars)', () => {
    expect(CATEGORY_COLORS).toEqual({
      Rides: '#22c55e',
      Errands: '#f59e0b',
      'Home Help': '#3b82f6',
      'Tech Support': '#8b5cf6',
      'Member Added': '#64748b',
    })
  })
})

describe('statusCount', () => {
  const by = { completed: 70, unmatched: 4, memberCancelled: 10, volunteerCancelled: 6 }

  it('all sums the 4 keys', () => {
    expect(statusCount(by, 'all')).toBe(90)
  })

  it('single status returns that key', () => {
    expect(statusCount(by, 'completed')).toBe(70)
    expect(statusCount(by, 'memberCancelled')).toBe(10)
  })
})

describe('legsApply', () => {
  it('true only when legs is on AND selection is completed or all', () => {
    expect(legsApply('all', true)).toBe(true)
    expect(legsApply('completed', true)).toBe(true)
    expect(legsApply('all', false)).toBe(false)
    expect(legsApply('completed', false)).toBe(false)
    expect(legsApply('memberCancelled', true)).toBe(false)
    expect(legsApply('unmatched', true)).toBe(false)
  })
})

describe('adjustedCount', () => {
  const entry = { byStatus: { completed: 70, unmatched: 4, memberCancelled: 10, volunteerCancelled: 6 }, completedRoundTrips: 8 }

  it('adds completedRoundTrips when legs applies (all)', () => {
    expect(adjustedCount(entry, 'all', true)).toBe(98)
  })

  it('adds completedRoundTrips when legs applies (completed)', () => {
    expect(adjustedCount(entry, 'completed', true)).toBe(78)
  })

  it('does not add legs for a non-completed selection', () => {
    expect(adjustedCount(entry, 'memberCancelled', true)).toBe(10)
  })

  it('does not add legs when legs is off', () => {
    expect(adjustedCount(entry, 'completed', false)).toBe(70)
    expect(adjustedCount(entry, 'all', false)).toBe(90)
  })
})

describe('categoryChart', () => {
  const metrics = makeMetrics()

  it('omits zero-value slices but keeps all 5 rows with pct', () => {
    const { slices, rows } = categoryChart(metrics.byCategory, 'completed', false)
    // Rides 40, Errands 20, Home Help 10 are nonzero; Tech Support and Member Added are 0
    expect(slices).toEqual([
      { label: 'Rides', value: 40, color: '#22c55e' },
      { label: 'Errands', value: 20, color: '#f59e0b' },
      { label: 'Home Help', value: 10, color: '#3b82f6' },
    ])
    expect(rows).toHaveLength(5)
    const total = 70 // 40 + 20 + 10
    expect(rows).toEqual([
      { label: 'Rides', value: 40, color: '#22c55e', pct: 40 / total },
      { label: 'Errands', value: 20, color: '#f59e0b', pct: 20 / total },
      { label: 'Home Help', value: 10, color: '#3b82f6', pct: 10 / total },
      { label: 'Tech Support', value: 0, color: '#8b5cf6', pct: 0 },
      { label: 'Member Added', value: 0, color: '#64748b', pct: 0 },
    ])
  })

  it('applies legs adjustment to completed selection', () => {
    const { rows } = categoryChart(metrics.byCategory, 'completed', true)
    // Rides: 40+6=46, Errands: 20+2=22, Home Help: 10+0=10
    const ridesRow = rows.find(r => r.label === 'Rides')
    const errandsRow = rows.find(r => r.label === 'Errands')
    expect(ridesRow.value).toBe(46)
    expect(errandsRow.value).toBe(22)
  })

  it('all-zero total yields pct 0 for every row', () => {
    const zeroCategories = [
      { category: 'Rides', byStatus: emptyStatus(), completedRoundTrips: 0 },
      { category: 'Errands', byStatus: emptyStatus(), completedRoundTrips: 0 },
      { category: 'Home Help', byStatus: emptyStatus(), completedRoundTrips: 0 },
      { category: 'Tech Support', byStatus: emptyStatus(), completedRoundTrips: 0 },
      { category: 'Member Added', byStatus: emptyStatus(), completedRoundTrips: 0 },
    ]
    const { slices, rows } = categoryChart(zeroCategories, 'unmatched', false)
    expect(slices).toEqual([])
    expect(rows.every(r => r.pct === 0)).toBe(true)
  })

  // Version-skew defense: an older/mismatched API response can omit completedRoundTrips
  // even though the OAS schema marks it required. With legs ON, `base + undefined` used to
  // produce NaN, which the `r.value > 0` slice filter then silently dropped — every slice
  // vanished and the pie rendered a false "No completed requests" empty state over real data.
  it('legs on + missing completedRoundTrips: values stay finite and real slices survive', () => {
    const categoriesMissingField = [
      { category: 'Rides', byStatus: { ...emptyStatus(), completed: 40 } }, // no completedRoundTrips key
      { category: 'Errands', byStatus: { ...emptyStatus(), completed: 20 } },
      { category: 'Home Help', byStatus: emptyStatus() },
      { category: 'Tech Support', byStatus: emptyStatus() },
      { category: 'Member Added', byStatus: emptyStatus() },
    ]
    const { slices, rows } = categoryChart(categoriesMissingField, 'completed', true)
    expect(rows.every(r => Number.isFinite(r.value) && Number.isFinite(r.pct))).toBe(true)
    expect(slices).toEqual([
      { label: 'Rides', value: 40, color: '#22c55e' },
      { label: 'Errands', value: 20, color: '#f59e0b' },
    ])
  })
})

describe('serviceChart', () => {
  const metrics = makeMetrics()

  it('filters by category; null category only appears under all', () => {
    const rides = serviceChart(metrics.byServiceType, 'completed', 'Rides', false)
    expect(rides.rows.map(r => r.label)).toEqual(['Ride: Medical', 'Ride: Social'])

    const all = serviceChart(metrics.byServiceType, 'completed', 'all', false)
    expect(all.rows.map(r => r.label)).toContain('Something Custom')
  })

  it('sorts by adjustedCount desc then serviceName asc', () => {
    const { rows } = serviceChart(metrics.byServiceType, 'completed', 'all', false)
    // completed counts: Ride: Medical 30, Errand: Grocery 19, Ride: Social 10,
    // Household Chores/Handy Help 10, Something Custom 5, Tiny Errand 1
    expect(rows.map(r => r.label)).toEqual([
      'Ride: Medical',
      'Errand: Grocery',
      'Home Help', // display label for Household Chores/Handy Help; tie w/ Ride: Social at 10 -> alpha asc
      'Ride: Social',
      'Something Custom',
      'Tiny Errand',
    ])
  })

  // TEMPORARY, paired with SERVICE_LABELS in metricsView.js — delete both when the
  // serviceName is renamed in the SR table.
  it('shortens Household Chores/Handy Help to Home Help for display', () => {
    const { rows } = serviceChart(metrics.byServiceType, 'completed', 'all', false)
    expect(rows.map(r => r.label)).toContain('Home Help')
    expect(rows.map(r => r.label)).not.toContain('Household Chores/Handy Help')
  })

  it('passes unmapped serviceNames through unchanged', () => {
    const { rows } = serviceChart(metrics.byServiceType, 'completed', 'all', false)
    // 'Something Custom' is a user-typed name with no SERVICE_LABELS entry.
    expect(rows.map(r => r.label)).toContain('Something Custom')
  })

  it('merges slices under otherPct of the selected total into one Other slice', () => {
    // Construct a fixture where one entry sits at ~1% of the total (< default 2% threshold).
    const total = 1000
    const small = 10 // 1% of 1000
    const entries = [
      { serviceName: 'Big One', category: 'Rides', byStatus: { ...emptyStatus(), completed: total - small }, completedRoundTrips: 0 },
      { serviceName: 'Small One', category: 'Rides', byStatus: { ...emptyStatus(), completed: small }, completedRoundTrips: 0 },
    ]
    const { slices, rows } = serviceChart(entries, 'completed', 'all', false)
    expect(slices).toEqual([
      { label: 'Big One', value: total - small, color: '#0ea5e9' },
      { label: 'Other', value: small, color: '#94a3b8' },
    ])
    // rows unroll every serviceName — no Other row
    expect(rows.map(r => r.label)).toEqual(['Big One', 'Small One'])
    expect(rows.find(r => r.label === 'Small One').pct).toBe(small / total)
  })

  it('cycles the neutral categorical ramp for slice colors', () => {
    const ramp = ['#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b']
    const entries = Array.from({ length: 9 }, (_, i) => ({
      serviceName: `Svc ${i}`,
      category: 'Rides',
      byStatus: { ...emptyStatus(), completed: 100 - i }, // strictly descending, no Other merge (all well above 2%)
      completedRoundTrips: 0,
    }))
    const { slices } = serviceChart(entries, 'completed', 'all', false, 0) // otherPct 0 disables merging
    expect(slices.map(s => s.color)).toEqual([...ramp, ramp[0]])
  })
})

describe('outcomesChart', () => {
  const totals = {
    totalRequests: 90,
    byStatus: { completed: 70, unmatched: 4, memberCancelled: 10, volunteerCancelled: 6 },
    completedRoundTrips: 8,
  }

  it('4 fixed entries with legs adjusting only Completed', () => {
    const { rows } = outcomesChart(totals, true)
    expect(rows).toEqual([
      { label: 'Completed', value: 78, color: '#22c55e', pct: 78 / (78 + 10 + 6 + 4) },
      { label: 'Member cancelled', value: 10, color: '#f59e0b', pct: 10 / (78 + 10 + 6 + 4) },
      { label: 'Volunteer cancelled', value: 6, color: '#ef4444', pct: 6 / (78 + 10 + 6 + 4) },
      { label: 'Unmatched', value: 4, color: '#94a3b8', pct: 4 / (78 + 10 + 6 + 4) },
    ])
  })

  it('no legs adjustment when legs is off', () => {
    const { rows } = outcomesChart(totals, false)
    expect(rows.find(r => r.label === 'Completed').value).toBe(70)
  })

  it('omits zero slices', () => {
    const zeroed = { ...totals, byStatus: { ...totals.byStatus, unmatched: 0 } }
    const { slices } = outcomesChart(zeroed, false)
    expect(slices.find(s => s.label === 'Unmatched')).toBeUndefined()
    expect(slices).toHaveLength(3)
  })

  it('all-zero total yields pct 0 for every row (div-by-zero guard)', () => {
    const zeroTotals = {
      totalRequests: 0,
      byStatus: { completed: 0, unmatched: 0, memberCancelled: 0, volunteerCancelled: 0 },
      completedRoundTrips: 0,
    }
    const { slices, rows } = outcomesChart(zeroTotals, false)
    expect(slices).toEqual([])
    expect(rows.every(r => r.pct === 0)).toBe(true)
  })

  // Version-skew defense: legs ON but the API response omits completedRoundTrips.
  it('legs on + missing completedRoundTrips: Completed stays finite, not NaN', () => {
    const { totalRequests, byStatus } = totals
    const totalsMissingField = { totalRequests, byStatus } // no completedRoundTrips key
    const { rows, slices } = outcomesChart(totalsMissingField, true)
    const completedRow = rows.find(r => r.label === 'Completed')
    expect(Number.isFinite(completedRow.value)).toBe(true)
    expect(completedRow.value).toBe(70) // 70 + 0, not 70 + undefined
    expect(slices.find(s => s.label === 'Completed')).toBeTruthy() // slice not dropped
  })
})

describe('stripStats', () => {
  // (emptyStatus is defined once, above, and reused here via closure)
  const metrics = makeMetrics()

  it('legs off: raw totals, unmatched, cancelled sum', () => {
    const stats = stripStats(metrics, false)
    expect(stats.requests).toBe(90)
    expect(stats.completed).toBe(70)
    expect(stats.unmatched).toBe(4)
    expect(stats.cancelled).toBe(16) // 10 + 6
  })

  it('legs on: requests and completed both bumped by totals.completedRoundTrips', () => {
    const stats = stripStats(metrics, true)
    expect(stats.requests).toBe(98)
    expect(stats.completed).toBe(78)
    expect(stats.unmatched).toBe(4) // legs-independent
    expect(stats.cancelled).toBe(16) // legs-independent
  })

  // Version-skew defense: legs ON but the API response omits completedRoundTrips.
  // Previously `90 + undefined` -> NaN, which rendered literal "NaN" in the summary strip.
  it('legs on + missing completedRoundTrips: finite numbers, not NaN', () => {
    const { totalRequests, byStatus } = metrics.totals
    const metricsMissingField = {
      ...metrics,
      totals: { totalRequests, byStatus }, // no completedRoundTrips key
    }
    const stats = stripStats(metricsMissingField, true)
    expect(Number.isFinite(stats.requests)).toBe(true)
    expect(Number.isFinite(stats.completed)).toBe(true)
    expect(stats.requests).toBe(90) // 90 + 0, not 90 + undefined
    expect(stats.completed).toBe(70)
  })
})
